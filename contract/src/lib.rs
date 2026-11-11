// Ctrl Predicts - binary prediction market contract (Rust, near-sdk 5.x)
//
// Money rules
//  - Bets are pooled: YES pool vs NO pool (amounts in yoctoNEAR).
//  - On resolve, a fee (fee_bps, default 2%) is taken from the TOTAL pool.
//    Fee split: 30% to the resolver agent (paid immediately), 70% to the treasury.
//  - Winners claim: stake * (total_pool - fee) / winning_pool.
//  - If one side has no bets, the market resolves as a refund: everyone gets
//    their stake back and no fee is taken.

use near_sdk::json_types::U128;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

const BPS: u128 = 10_000;
const RESOLVER_SHARE_BPS: u128 = 3_000; // 30% of the fee goes to the resolver agent

#[allow(clippy::upper_case_acronyms)]
#[allow(non_camel_case_types)]
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Side {
    YES,
    NO,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Market {
    pub id: u32,
    pub question: String,
    pub category: String, // "crypto" | "entertainment" | "sports" | "other"
    pub closes_at_ms: u64,
    pub resolved: bool,
    pub yes_pool: u128,
    pub no_pool: u128,
    pub outcome: Option<Side>,
    pub evidence_hash: Option<String>,
    pub refund: bool,
    pub fee_paid: u128,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Position {
    pub yes: u128,
    pub no: u128,
    pub claimed: bool,
}

// ---- JSON shapes returned to the frontend / agent (amounts are strings) ----

#[near(serializers = [json])]
pub struct MarketView {
    pub id: u32,
    pub question: String,
    pub category: String,
    pub closes_at_ms: u64,
    pub status: String, // "open" | "closed" | "resolved"
    pub yes_pool: U128,
    pub no_pool: U128,
    pub outcome: Option<Side>,
    pub evidence_hash: Option<String>,
    pub refund: bool,
    pub fee_paid: U128,
}

#[near(serializers = [json])]
pub struct PositionView {
    pub yes: U128,
    pub no: U128,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct StatsView {
    pub fee_bps: u32,
    pub markets_total: u32,
    pub total_volume: U128,
    pub fees_collected: U128,
    pub treasury_balance: U128,
    pub resolver_earned: U128,
}

/// floor(a * b / c) without overflowing u128 (needed because yocto amounts are ~1e24).
/// Requires a <= c * 2 and c < 2^127 (true for our pools).
fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    let q = (a / c) * b;
    let r0 = a % c;
    let mut r: u128 = 0;
    let mut part: u128 = 0;
    for i in (0..128).rev() {
        r <<= 1;
        part <<= 1;
        if r >= c {
            r -= c;
            part += 1;
        }
        if (b >> i) & 1 == 1 {
            r += r0;
            if r >= c {
                r -= c;
                part += 1;
            }
        }
    }
    q + part
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    resolver: AccountId,
    fee_bps: u32,
    markets: Vector<Market>,
    positions: LookupMap<String, Position>,
    total_volume: u128,
    fees_collected: u128,
    treasury_balance: u128,
    resolver_earned: u128,
}

#[near]
impl Contract {
    // ---------- setup ----------

    #[init]
    pub fn new(owner: AccountId, resolver: AccountId, fee_bps: Option<u32>) -> Self {
        let fee_bps = fee_bps.unwrap_or(200);
        require!(fee_bps <= 1000, "fee_bps must be 0-1000 (max 10%)");
        Self {
            owner,
            resolver,
            fee_bps,
            markets: Vector::new(b"m".to_vec()),
            positions: LookupMap::new(b"p".to_vec()),
            total_volume: 0,
            fees_collected: 0,
            treasury_balance: 0,
            resolver_earned: 0,
        }
    }

    // ---------- admin ----------

    pub fn create_market(&mut self, question: String, category: String, closes_at_ms: u64) -> u32 {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can create markets"
        );
        require!(!question.is_empty(), "Question required");
        require!(
            closes_at_ms > env::block_timestamp_ms(),
            "closes_at_ms must be in the future"
        );
        let id = self.markets.len();
        self.markets.push(Market {
            id,
            question,
            category,
            closes_at_ms,
            resolved: false,
            yes_pool: 0,
            no_pool: 0,
            outcome: None,
            evidence_hash: None,
            refund: false,
            fee_paid: 0,
        });
        id
    }

    pub fn withdraw_treasury(&mut self) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can withdraw"
        );
        let amount = self.treasury_balance;
        require!(amount > 0, "Treasury is empty");
        self.treasury_balance = 0;
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount))
    }

    // ---------- trading ----------

    #[payable]
    pub fn bet(&mut self, market_id: u32, side: Side) {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit > 0, "Attach NEAR to bet");
        let now = env::block_timestamp_ms();

        {
            let m = self
                .markets
                .get_mut(market_id)
                .unwrap_or_else(|| env::panic_str("Market not found"));
            require!(!m.resolved, "Market already resolved");
            require!(now < m.closes_at_ms, "Market is closed for betting");
            match side {
                Side::YES => m.yes_pool += deposit,
                Side::NO => m.no_pool += deposit,
            }
        }

        let key = format!("{}:{}", market_id, env::predecessor_account_id());
        let mut pos = self.positions.get(&key).cloned().unwrap_or(Position {
            yes: 0,
            no: 0,
            claimed: false,
        });
        match side {
            Side::YES => pos.yes += deposit,
            Side::NO => pos.no += deposit,
        }
        self.positions.insert(key, pos);

        self.total_volume += deposit;
    }

    /// Called by the AI resolver agent after the market closes.
    pub fn resolve(&mut self, market_id: u32, outcome: Side, evidence_hash: Option<String>) {
        require!(
            env::predecessor_account_id() == self.resolver,
            "Only the resolver can resolve"
        );

        let (yes, no, resolved, closes_at_ms) = {
            let m = self.market(market_id);
            (m.yes_pool, m.no_pool, m.resolved, m.closes_at_ms)
        };
        require!(!resolved, "Already resolved");
        require!(
            env::block_timestamp_ms() >= closes_at_ms,
            "Market has not closed yet"
        );

        let total = yes + no;
        // One side empty: nobody to pay, so refund everyone and take no fee.
        let refund = yes == 0 || no == 0;
        let fee = if refund { 0 } else { total * self.fee_bps as u128 / BPS };
        let resolver_cut = fee * RESOLVER_SHARE_BPS / BPS;
        let treasury_cut = fee - resolver_cut;

        {
            let m = self
                .markets
                .get_mut(market_id)
                .unwrap_or_else(|| env::panic_str("Market not found"));
            m.resolved = true;
            m.outcome = Some(outcome);
            m.evidence_hash = evidence_hash;
            m.refund = refund;
            m.fee_paid = fee;
        }

        self.fees_collected += fee;
        self.treasury_balance += treasury_cut;
        self.resolver_earned += resolver_cut;

        if resolver_cut > 0 {
            let _ = Promise::new(self.resolver.clone())
                .transfer(NearToken::from_yoctonear(resolver_cut));
        }
    }

    pub fn claim(&mut self, market_id: u32) -> Promise {
        let m = self.market(market_id).clone();
        require!(m.resolved, "Market not resolved yet");

        let who = env::predecessor_account_id();
        let key = format!("{}:{}", market_id, who);
        let mut pos = self
            .positions
            .get(&key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No position found"));
        require!(!pos.claimed, "Already claimed");

        let payout = if m.refund {
            pos.yes + pos.no
        } else {
            let outcome = m
                .outcome
                .unwrap_or_else(|| env::panic_str("Missing outcome"));
            let (stake, winning_pool) = match outcome {
                Side::YES => (pos.yes, m.yes_pool),
                Side::NO => (pos.no, m.no_pool),
            };
            require!(stake > 0, "Your side did not win");
            let net_pool = m.yes_pool + m.no_pool - m.fee_paid;
            mul_div(stake, net_pool, winning_pool)
        };
        require!(payout > 0, "Nothing to claim");

        pos.claimed = true;
        self.positions.insert(key, pos);
        Promise::new(who).transfer(NearToken::from_yoctonear(payout))
    }

    // ---------- views ----------

    pub fn get_markets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MarketView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50) as usize;
        self.markets
            .iter()
            .skip(from)
            .take(limit)
            .map(|m| self.present(m))
            .collect()
    }

    pub fn get_market(&self, id: u32) -> MarketView {
        self.present(self.market(id))
    }

    pub fn get_position(&self, market_id: u32, account_id: AccountId) -> PositionView {
        let key = format!("{}:{}", market_id, account_id);
        match self.positions.get(&key) {
            Some(p) => PositionView {
                yes: U128(p.yes),
                no: U128(p.no),
                claimed: p.claimed,
            },
            None => PositionView {
                yes: U128(0),
                no: U128(0),
                claimed: false,
            },
        }
    }

    pub fn get_stats(&self) -> StatsView {
        StatsView {
            fee_bps: self.fee_bps,
            markets_total: self.markets.len(),
            total_volume: U128(self.total_volume),
            fees_collected: U128(self.fees_collected),
            treasury_balance: U128(self.treasury_balance),
            resolver_earned: U128(self.resolver_earned),
        }
    }

    // ---------- helpers (private: not exposed as contract methods) ----------

    #[private]
    pub fn noop(&self) {}
}

impl Contract {
    fn market(&self, id: u32) -> &Market {
        self.markets
            .get(id)
            .unwrap_or_else(|| env::panic_str("Market not found"))
    }

    fn present(&self, m: &Market) -> MarketView {
        let status = if m.resolved {
            "resolved"
        } else if env::block_timestamp_ms() >= m.closes_at_ms {
            "closed"
        } else {
            "open"
        };
        MarketView {
            id: m.id,
            question: m.question.clone(),
            category: m.category.clone(),
            closes_at_ms: m.closes_at_ms,
            status: status.to_string(),
            yes_pool: U128(m.yes_pool),
            no_pool: U128(m.no_pool),
            outcome: m.outcome,
            evidence_hash: m.evidence_hash.clone(),
            refund: m.refund,
            fee_paid: U128(m.fee_paid),
        }
    }
}

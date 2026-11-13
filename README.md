# Ctrl Predicts

**An AI encyclopedia where every entry is a prediction market.** Each question is a YES/NO market on NEAR. An AI agent writes the encyclopedia entry (summary and sources), and after the market closes it resolves the outcome on-chain and publishes the evidence behind its decision.

Built for **NEAR HACKATHON** (track: Agent Economy). Runs on **NEAR testnet only. No real funds.**

- **Live site:** https://ctrl-predicts.netlify.app
- **Demo video:** https://x.com/ctrl_predicts/status/2121161936813293954
- **X:** https://x.com/ctrl_predicts
- **Contract on testnet:** `ctrlpredicts.testnet` (https://testnet.nearblocks.io/address/ctrlpredicts.testnet)

## What it does

- **Markets:** crypto price questions and entertainment/sports questions.
- **AI-written entries:** the agent writes a short article with sources for every market.
- **AI resolution with evidence:** the agent resolves each market after close. Crypto price markets are settled by a fixed rule on historical CoinGecko price data. News markets are settled by the AI from news sources. Each decision is saved, hashed (SHA-256) and the hash is recorded on-chain.
- **Unclear evidence is never guessed:** if the agent can't tell, it does not resolve. A market that has bets on only one side is refunded.
- **Revenue model (visible on testnet):** a 2% fee on the pool at resolution. 70% goes to the treasury, 30% is paid to the resolver agent immediately.

## Try it (do X, see Y)

### Fastest way: the live site (no install)

1. **Do:** open https://ctrl-predicts.netlify.app and click **Launch app**.
   **See:** markets grouped into Active, Awaiting the AI agent and Resolved. The first load can take up to a minute while the free API server wakes up.
2. **Do:** click **Connect wallet** and pick a NEAR testnet account.
   **See:** your account and testnet balance in the header.
3. **Do:** open an active market, enter an amount and click YES or NO, then confirm in your wallet.
   **See:** "Bet placed" with a transaction link, and the market moves to "Your active bets".
4. **Do:** open a resolved market.
   **See:** the outcome, the agent's reasoning, its sources and the evidence hash.

### Run it yourself

You need Node 20+ and a NEAR testnet wallet (for example a HOT or MyNearWallet testnet account, funded from the testnet faucet).

1. **Do:** `git clone https://github.com/zoelaenski/ctrl-predicts && cd ctrl-predicts/agent && npm install`
   **See:** dependencies install without errors.
2. **Do:** copy your settings into `agent/.env` (see "Configuration" below), then run `npm start`.
   **See:** `Ctrl Predicts API on http://localhost:3001` and `Agent loop on: checking every 60s`.
3. **Do:** open http://localhost:3001/api/entries in a browser.
   **See:** a JSON list of markets with their AI-written summaries.
4. **Do:** in a second terminal, serve the site: `npx serve frontend -l 8080`, then open http://localhost:8080.
   **See:** the market list with live pools and statuses.
5. **Do:** click **Connect wallet**, pick a testnet account.
   **See:** your account and testnet balance in the header.
6. **Do:** open a market, enter an amount (for example 1 NEAR), pick YES or NO, confirm in your wallet.
   **See:** "Bet placed" with a link to the transaction, and the pool updates.
7. **Do:** wait for the market to close (or create a short one with `npm run seed`).
   **See:** the status changes to "Closed, awaiting AI agent", then to "Resolved" with the outcome, the agent's reasoning, its sources and the evidence hash.
8. **Do:** if you backed the winning side, click **Claim**.
   **See:** your winnings (stake share of the pool minus the 2% fee) arrive in your wallet.
9. **Do:** open the **Stats** page.
   **See:** total volume, fees collected, treasury balance and the resolver agent's earnings.

## Configuration (`agent/.env`)

```
CONTRACT_ID=ctrlpredicts.testnet
OWNER_ID=<testnet account that creates markets>
OWNER_KEY=<its key>
RESOLVER_ID=<testnet account that resolves markets>
RESOLVER_KEY=<its key>
LLM_API_KEY=<key for an OpenAI-compatible provider>
LLM_BASE_URL=https://cloud-api.near.ai/v1
LLM_MODEL=<model name>
```

Never commit `.env` (it is in `.gitignore`). Use testnet-only accounts.

The agent talks to any OpenAI-compatible API. It is designed for **NEAR AI Cloud** (the default base URL above). The demo run used Groq's free tier (`openai/gpt-oss-120b`) because no paid credits were set up, so only `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` change.

## How it is built

- `contract/`: Rust smart contract (near-sdk 5.x). Pooled YES/NO markets, fee split, refunds, overflow-safe payout math. Only the resolver account can resolve, and only after close.
- `agent/`: Node service. Writes entries, resolves markets, serves a read API for the site.
- `frontend/`: single-page site using NEAR Connect for wallet sign-in and transactions.

## Roadmap

- **Autonomous market creation:** an agent reads trending news and crypto moves, drafts new YES/NO questions that can be settled with public evidence, and creates the markets itself, with a daily cap and duplicate checks. Today the owner creates markets with `npm run seed`; this removes the human from that step.
- Challenge window (about 24h) before payouts, so a resolution can be disputed.
- Mainnet launch only after a legal and compliance review of prediction markets.
- More resolver agents competing on accuracy and fees.
- Function-call access keys so the agent never holds a full-access key.

## Team

Backend and contract: Florence. Frontend: Devshawn7.

import 'dotenv/config';

export const cfg = {
  // NEAR
  contractId: process.env.CONTRACT_ID || 'ctrlpredicts.testnet',
  rpcUrl: process.env.RPC_URL || 'https://test.rpc.fastnear.com',
  ownerId: process.env.OWNER_ID || 'ctrlpredicts.testnet',
  ownerKey: process.env.OWNER_KEY,
  resolverId: process.env.RESOLVER_ID || 'ctrlpredicts-agent.testnet',
  resolverKey: process.env.RESOLVER_KEY,

  // NEAR AI Cloud (OpenAI-compatible)
  apiKey: process.env.NEARAI_API_KEY,
  llmBase: process.env.LLM_BASE_URL || 'https://cloud-api.near.ai/v1',
  model: process.env.LLM_MODEL || 'zai-org/GLM-5.1-FP8',

  // Server
  port: Number(process.env.PORT || 3001),
  autoAgent: process.env.AUTO_AGENT !== 'false',
  tickSeconds: Number(process.env.TICK_SECONDS || 60),
};

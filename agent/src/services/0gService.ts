/**
 * 0G Compute Network service wrapper.
 * Handles AI inference for attack generation and remediation.
 */
import { ethers } from 'ethers';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Read at module load (after index.ts has loaded .env from root)
const rawKey = process.env.PRIVATE_KEY_DEPLOYER;
const PRIVATE_KEY = rawKey?.startsWith('0x') ? rawKey : rawKey ? `0x${rawKey}` : undefined;
// 0G network: set 0G_RPC_URL to mainnet (https://evmrpc.0g.ai) to use real 0G; omit for testnet
const RPC_URL =
  process.env['0G_RPC_URL'] ||
  process.env.RPC_URL_SEPOLIA ||
  'https://evmrpc-testnet.0g.ai';

// Use CommonJS require - the ESM build is broken on Node 23 (export named 'C' missing)
function getBrokerCreator(): typeof import('@0glabs/0g-serving-broker').createZGComputeNetworkBroker | null {
  try {
    const brokerModule = require('@0glabs/0g-serving-broker');
    return brokerModule.createZGComputeNetworkBroker ?? null;
  } catch (e) {
    console.error('[0G] Failed to load SDK:', e);
    return null;
  }
}

type BrokerType = Awaited<ReturnType<NonNullable<ReturnType<typeof getBrokerCreator>>>>;
let broker: BrokerType | null = null;

/**
 * Initialize 0G broker with wallet signer if private key is available.
 */
async function initBroker(): Promise<BrokerType | null> {
  if (!PRIVATE_KEY || PRIVATE_KEY === '0x...' || PRIVATE_KEY === '') {
    console.warn('[0G] No private key provided. 0G inference disabled. Set PRIVATE_KEY_DEPLOYER in .env');
    return null;
  }

  if (!broker) {
    try {
      const createBroker = getBrokerCreator();
      if (!createBroker) {
        return null;
      }
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      // @ts-expect-error - ethers version compatibility issue, but should work at runtime
      broker = await createBroker(wallet);
      console.log('[0G] Broker initialized');
    } catch (e) {
      console.error('[0G] Failed to initialize broker:', e);
      return null;
    }
  }

  return broker;
}

const ONE_OG = BigInt(1e18);

/**
 * Get 0G account balance (main ledger + inference sub-accounts). Returns null if 0G unavailable.
 */
export async function get0GAccountBalance(): Promise<{
  main: { total_0g: number; available_0g: number };
  inference: Array<{ provider: string; balance_0g: number; pending_refund_0g: number }>;
} | null> {
  const brokerInstance = await initBroker();
  if (!brokerInstance?.ledger) return null;

  try {
    const ledger = await brokerInstance.ledger.getLedger();
    const total = Number(ledger.totalBalance ?? 0n) / Number(ONE_OG);
    const available = Number(ledger.availableBalance ?? 0n) / Number(ONE_OG);

    let inference: Array<{ provider: string; balance_0g: number; pending_refund_0g: number }> = [];
    const innerLedger = (brokerInstance.ledger as { ledger?: { getLedgerWithDetail(): Promise<{ ledgerInfo: bigint[]; infers: [string, bigint, bigint][] }> } }).ledger;
    if (innerLedger?.getLedgerWithDetail) {
      const detail = await innerLedger.getLedgerWithDetail();
      inference = (detail.infers ?? []).map(([provider, balance, pendingRefund]) => ({
        provider,
        balance_0g: Number(balance ?? 0n) / Number(ONE_OG),
        pending_refund_0g: Number(pendingRefund ?? 0n) / Number(ONE_OG),
      }));
    }

    return {
      main: { total_0g: total, available_0g: available },
      inference,
    };
  } catch (e) {
    console.error('[0G] get0GAccountBalance failed:', e);
    return null;
  }
}

/**
 * Call 0G AI with a prompt. Falls back to local mock if 0G unavailable.
 */
export async function call0GAI(prompt: string, systemPrompt?: string): Promise<string> {
  const brokerInstance = await initBroker();

  if (!brokerInstance) {
    // Fallback: SDK failed to load or broker init failed
    console.warn('[0G] Using fallback mock response (SDK unavailable or init failed)');
    return `[Mock 0G Response] ${prompt.substring(0, 100)}...`;
  }

  try {
    // List available services
    const services = await brokerInstance.inference.listService();
    if (!services || services.length === 0) {
      throw new Error('No 0G services available');
    }

    // Use first available LLM service
    const llmService = services.find((s: any) =>
      s.model?.includes('chat') || s.model?.includes('instruct') || s.model?.includes('llm')
    ) || services[0];

    // Extract provider address from service (structure may vary)
    const providerAddress = (llmService as any).providerAddress || (llmService as any).provider || (llmService as any)[0];

    // Acknowledge provider. SDK creates sub-account (transfer 1 OG from main) only if none exists.
    await brokerInstance.inference.acknowledgeProviderSigner(providerAddress);

    // Get service metadata and request headers
    const { endpoint, model } = await brokerInstance.inference.getServiceMetadata(providerAddress);
    const headers = await brokerInstance.inference.getRequestHeaders(providerAddress);

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Make inference request
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`0G API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const chatID =
      response.headers.get('ZG-Res-Key') ??
      response.headers.get('zg-res-key') ??
      data?.id ??
      data?.chatID;
    if (chatID) {
      console.log('[0G] Inference response ID (compute hash):', chatID);
    }
    return data.choices?.[0]?.message?.content || JSON.stringify(data);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const isNetwork = err.cause?.code === 'ECONNRESET' || err.message?.includes('fetch failed');
    if (isNetwork) {
      console.warn('[0G] Unreachable (connection failed). Use local fallback or check network.');
    } else {
      console.error('[0G] Inference error:', e);
    }
    throw new Error(`0G inference failed: ${err.message ?? String(e)}`);
  }
}

/**
 * Check if 0G is available (has private key).
 */
export function is0GAvailable(): boolean {
  return (
    PRIVATE_KEY !== undefined &&
    PRIVATE_KEY !== '0x...' &&
    PRIVATE_KEY !== '' &&
    PRIVATE_KEY !== 'your_private_key_here'
  );
}

/**
 * 0G Compute Network service wrapper.
 * Handles AI inference for attack generation and remediation.
 */
import { ethers } from 'ethers';

const PRIVATE_KEY = process.env.PRIVATE_KEY_DEPLOYER;
const RPC_URL = process.env.RPC_URL_SEPOLIA || 'https://evmrpc-testnet.0g.ai';

// Lazy import to handle ESM module resolution
async function getBrokerCreator() {
  try {
    const brokerModule = await import('@0glabs/0g-serving-broker');
    return brokerModule.createZGComputeNetworkBroker;
  } catch (e) {
    console.error('[0G] Failed to import SDK:', e);
    return null;
  }
}

type BrokerType = Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof getBrokerCreator>>>>>;
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
      const createBroker = await getBrokerCreator();
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

/**
 * Call 0G AI with a prompt. Falls back to local mock if 0G unavailable.
 */
export async function call0GAI(prompt: string, systemPrompt?: string): Promise<string> {
  const brokerInstance = await initBroker();

  if (!brokerInstance) {
    // Fallback: return a mock response for development
    console.warn('[0G] Using fallback mock response (no private key)');
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
    
    // Acknowledge provider
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
    return data.choices?.[0]?.message?.content || JSON.stringify(data);
  } catch (e) {
    console.error('[0G] Inference error:', e);
    throw new Error(`0G inference failed: ${String(e)}`);
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

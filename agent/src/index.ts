/**
 * Agent entry: start the analyzer HTTP server.
 * Load .env from repo ROOT first (before any other imports read process.env).
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try repo root .env: from agent/src -> ../../.env
const rootEnv = resolve(__dirname, '../../.env');
const loaded = config({ path: rootEnv });
if (loaded.parsed) {
  console.log('[agent] Loaded .env from', rootEnv);
} else {
  // Fallback: .env in agent folder or cwd
  config({ path: resolve(process.cwd(), '.env') });
  config({ path: resolve(process.cwd(), '../.env') });
}

// Log so we know root .env was used
if (process.env.PRIVATE_KEY_DEPLOYER) {
  console.log('[agent] PRIVATE_KEY_DEPLOYER is set (0G enabled)');
} else {
  console.log('[agent] PRIVATE_KEY_DEPLOYER not set (using mock/fallback)');
}

// Import server after env is loaded so 0gService sees PRIVATE_KEY_DEPLOYER
await import('./server.js');

import { LocalApi } from './local/localApi';
import { ServerApi } from './server/serverApi';
import type { ProjexApi } from './types';

// Adapter split (local vs server). The UI depends only on the ProjexApi contract.
//
// VITE_API_MODE=server will switch to the ServerApi stub (which will later call
// TanStack Start server functions). Default is local mode.
const env = (import.meta as unknown as { env?: Record<string, string> }).env;
const mode = env?.VITE_API_MODE ?? 'local';
export const api: ProjexApi = mode === 'server' ? new ServerApi() : new LocalApi();

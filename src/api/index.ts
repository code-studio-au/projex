import { LocalApi } from './local/localApi';
import { ServerApi } from './server/serverApi';
import type { ProjexApi } from './types';
import { isServerAuthMode } from '../routes/-authMode';

// Adapter split (local vs server). The UI depends only on the ProjexApi contract.
//
// `VITE_API_MODE=server` is the deployed/runtime path. Omitted means true local
// development with seeded users and local state.
export const api: ProjexApi = isServerAuthMode ? new ServerApi() : new LocalApi();

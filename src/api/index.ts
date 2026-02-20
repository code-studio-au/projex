import { LocalApi } from './local/localApi';
import type { ProjexApi } from './contract';

// Swap this implementation later for a server-backed adapter.
export const api: ProjexApi = new LocalApi();

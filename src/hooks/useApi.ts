import { useRouter } from '@tanstack/react-router';

import type { ProjexApi } from '../api/contract';

/**
 * Access the API boundary from the TanStack Router context.
 *
 * This avoids importing a global singleton inside hooks/components, which makes
 * moving to TanStack Start (request-scoped runtime) much easier.
 */
export function useApi(): ProjexApi {
  return useRouter().options.context.api;
}

import type { ProjexApi } from './types';

let implPromise: Promise<ProjexApi> | null = null;

async function loadApiImpl(): Promise<ProjexApi> {
  if (implPromise) return implPromise;

  implPromise = import('./server/runtime')
    .then((mod) => mod.createApi())
    .catch((error) => {
      implPromise = null;
      throw error;
    });

  return implPromise;
}

const apiHandler: ProxyHandler<object> = {
  get(_target, property) {
    return async (...args: unknown[]) => {
      const impl = await loadApiImpl();
      const method = impl[property as keyof ProjexApi];
      if (typeof method !== 'function') {
        throw new TypeError(
          `ProjexApi method ${String(property)} is not available`
        );
      }
      return Reflect.apply(method, impl, args);
    };
  },
};

// The app consumes the API contract asynchronously, so a lazy proxy keeps the
// heavy local/server implementations out of the initial bundle.
export const api = new Proxy({}, apiHandler) as ProjexApi;

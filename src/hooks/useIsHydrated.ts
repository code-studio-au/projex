import { useState, useSyncExternalStore } from 'react';

type HydrationListener = () => void;

function createHydrationStore() {
  const hydrationListeners = new Set<HydrationListener>();
  let hydrated = false;

  return {
    getSnapshot: () => hydrated,
    subscribe: (listener: HydrationListener) => {
      hydrationListeners.add(listener);

      if (!hydrated) {
        hydrated = true;
        queueMicrotask(() => {
          for (const hydrationListener of hydrationListeners) {
            hydrationListener();
          }
        });
      }

      return () => {
        hydrationListeners.delete(listener);
      };
    },
  };
}

const getServerSnapshot = () => false;

/**
 * Returns false for the server render and the first hydration render, then true
 * once React has attached client behavior.
 */
export function useIsHydrated() {
  const [hydrationStore] = useState(createHydrationStore);

  return useSyncExternalStore(
    hydrationStore.subscribe,
    hydrationStore.getSnapshot,
    getServerSnapshot
  );
}

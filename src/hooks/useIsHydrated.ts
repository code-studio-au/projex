import { useSyncExternalStore } from 'react';

type HydrationListener = () => void;

const hydrationListeners = new Set<HydrationListener>();
let hydrated = false;

const subscribe = (listener: HydrationListener) => {
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
};
const getClientSnapshot = () => hydrated;
const getServerSnapshot = () => false;

/**
 * Returns false for the server render and the first hydration render, then true
 * once React has attached client behavior.
 */
export function useIsHydrated() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

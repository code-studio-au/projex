import { lazy, Suspense } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';

import { theme } from './theme';
import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  APP_DEFAULT_COLOR_SCHEME,
} from './colorScheme';

const devtoolsEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === 'true';
const Devtools = devtoolsEnabled
  ? lazy(async () => import('./components/Devtools'))
  : null;
const colorSchemeManager = localStorageColorSchemeManager({
  key: APP_COLOR_SCHEME_STORAGE_KEY,
});

/** Root layout: intentionally minimal to keep route config clean. */
export function RootProviders({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
}) {
  const router = useRouter();
  const activeQueryClient = queryClient ?? router.options.context.queryClient;

  return (
    <MantineProvider
      theme={theme}
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme={APP_DEFAULT_COLOR_SCHEME}
    >
      <Notifications />
      <QueryClientProvider client={activeQueryClient}>
        {children}
      </QueryClientProvider>
    </MantineProvider>
  );
}

export function RootLayout() {
  return (
    <>
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </>
  );
}

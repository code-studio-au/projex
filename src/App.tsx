import { lazy, Suspense } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { queryClient } from './queryClient';
import { router } from './router';
import { theme } from './theme';

const Devtools = import.meta.env.DEV
  ? lazy(async () => import('./components/Devtools'))
  : null;

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {Devtools ? (
          <Suspense fallback={null}>
            <Devtools />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </MantineProvider>
  );
}

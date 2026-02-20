import React from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

import { queryClient } from './queryClient';
import { router } from './router';

export default function App() {
  const theme = createTheme({
    defaultRadius: 'md',
    primaryColor: 'blue',
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    headings: { fontFamily: 'inherit' },
    components: {
      ActionIcon: {
        defaultProps: { variant: 'subtle' },
      },
      Paper: {
        defaultProps: { radius: 'md' },
      },
    },
  });

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
        <TanStackRouterDevtools router={router} initialIsOpen={false} />
      </QueryClientProvider>
    </MantineProvider>
  );
}

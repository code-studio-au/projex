import { lazy, Suspense } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { RootProviders } from './layouts';
import { router } from './router';

const Devtools = import.meta.env.DEV
  ? lazy(async () => import('./components/Devtools'))
  : null;

export default function App() {
  return (
    <RootProviders>
      <RouterProvider router={router} />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </RootProviders>
  );
}

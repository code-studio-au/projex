import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { router } from '../router';

export default function Devtools() {
  return (
    <>
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools router={router} initialIsOpen={false} />
    </>
  );
}

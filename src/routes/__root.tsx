import { createRootRouteWithContext } from '@tanstack/react-router';

import { RootErrorComponent, RootNotFoundComponent } from '../components/routerErrors';
import { RootLayout } from '../layouts';
import type { RouterContext } from '../router-context';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});

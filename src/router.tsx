import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';

import { api } from './api';
import { queryClient } from './queryClient';
import { AuthedLayout, RootLayout } from './layouts';
import { RootErrorComponent, RootNotFoundComponent } from './components/routerErrors';
import { sessionQueryOptions } from './queries/session';
import type { ProjexApi } from './api/contract';
import type { QueryClient } from '@tanstack/react-query';

export type RouterContext = {
  api: ProjexApi;
  queryClient: QueryClient;
};

// Route tree
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});

export const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/LandingPage')),
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Child routes should use relative paths (no leading slash).
  // Using absolute paths under a parent can lead to confusing match stacks
  // and invariants during navigation.
  path: 'login',
  component: lazyRouteComponent(() => import('./pages/LoginPage')),
  beforeLoad: async ({ context }) => {
    // Optional: if already authed, skip login.
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );

    if (session) {
      const companyId = await context.api.getDefaultCompanyIdForUser(session.userId);
      if (companyId)
        throw redirect({
          to: companyRoute.to,
          params: { companyId },
        });

      throw redirect({ to: landingRoute.to });
    }
  },
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.api)
    );
    if (!session) throw redirect({ to: loginRoute.to });
  },
  component: AuthedLayout,
});

export const companyRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'c/$companyId',
  component: lazyRouteComponent(() => import('./pages/CompanyDashboardPage')),
});

export const projectRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'c/$companyId/p/$projectId',
  component: lazyRouteComponent(() => import('./pages/ProjectWorkspacePage')),
});

export const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  authedRoute.addChildren([companyRoute, projectRoute]),
]);

export const router = createRouter({
  routeTree,
  context: {
    api,
    queryClient,
  },
});

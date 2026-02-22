import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';

import { api } from './api';
import { AuthedLayout, RootLayout } from './layouts';

// Route tree
const rootRoute = createRootRoute({ component: RootLayout });

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/LandingPage')),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  // Child routes should use relative paths (no leading slash).
  // Using absolute paths under a parent can lead to confusing match stacks
  // and invariants during navigation.
  path: 'login',
  component: lazyRouteComponent(() => import('./pages/LoginPage')),
  beforeLoad: async () => {
    // Optional: if already authed, skip login.
    const session = await api.getSession();
    if (session) {
      const companyId = await api.getDefaultCompanyIdForUser(session.userId);
      if (companyId)
        throw redirect({
          to: companyRoute.to,
          params: { companyId },
        });
      throw redirect({ to: '/' });
    }
  },
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async () => {
    const session = await api.getSession();
    if (!session) throw redirect({ to: '/login' });
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

export const router = createRouter({ routeTree });


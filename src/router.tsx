import { createRouter, getRouteApi } from '@tanstack/react-router';

import { api } from './api';
import { queryClient } from './queryClient';
import type { RouterContext } from './router-context';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    context: {
      api,
      queryClient,
    } satisfies RouterContext,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

export const router = getRouter();

// Compatibility exports used across existing pages/components/hooks.
const homeRouteApi = getRouteApi('/');
const forgotPasswordRouteApi = getRouteApi('/forgot-password');
const loginRouteApi = getRouteApi('/login');
const verifyEmailChangeRouteApi = getRouteApi('/verify-email-change');
const landingRouteApi = getRouteApi('/_authed/companies');
const accountRouteApi = getRouteApi('/_authed/account');
const smokeRouteApi = getRouteApi('/_authed/smoke');
const companyRouteApi = getRouteApi('/_authed/c/$companyId');
const projectRouteApi = getRouteApi('/_authed/c/$companyId/p/$projectId');

export const homeRoute = { to: '/' as const, ...homeRouteApi };
export const forgotPasswordRoute = { to: '/forgot-password' as const, ...forgotPasswordRouteApi };
export const loginRoute = { to: '/login' as const, ...loginRouteApi };
export const verifyEmailChangeRoute = {
  to: '/verify-email-change' as const,
  ...verifyEmailChangeRouteApi,
};
export const landingRoute = { to: '/companies' as const, ...landingRouteApi };
export const accountRoute = { to: '/account' as const, ...accountRouteApi };
export const smokeRoute = { to: '/smoke' as const, ...smokeRouteApi };
export const companyRoute = { to: '/c/$companyId' as const, ...companyRouteApi };
export const projectRoute = {
  to: '/c/$companyId/p/$projectId' as const,
  ...projectRouteApi,
};

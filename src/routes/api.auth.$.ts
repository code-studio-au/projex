import { createFileRoute } from '@tanstack/react-router';
import type { AuthRouteModule } from '../api/routeBridgeModules';
import { serverRouteModuleSpecifier } from '../api/routeBridgeModules';
import { loadRouteServerModule, publicApiRouteMiddleware } from './-api-shared';

const authRouteModuleSpecifier = serverRouteModuleSpecifier('auth');

export const Route = createFileRoute('/api/auth/$')({
  server: {
    middleware: [publicApiRouteMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const { handleAuthRouteRequest } =
          await loadRouteServerModule<AuthRouteModule>(
            authRouteModuleSpecifier
          );
        return handleAuthRouteRequest(request);
      },
      POST: async ({ request }) => {
        const { handleAuthRouteRequest } =
          await loadRouteServerModule<AuthRouteModule>(
            authRouteModuleSpecifier
          );
        return handleAuthRouteRequest(request);
      },
    },
  },
});

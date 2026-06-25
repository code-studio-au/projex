import { createFileRoute } from '@tanstack/react-router';

import type { SessionRouteModule } from '../api/routeBridgeModules';
import { serverRouteModuleSpecifier } from '../api/routeBridgeModules';
import { apiRouteMiddleware, loadRouteServerModule } from './-api-shared';

const sessionRouteModuleSpecifier = serverRouteModuleSpecifier('session');

export const Route = createFileRoute('/api/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const { getSessionRouteResponse } =
          await loadRouteServerModule<SessionRouteModule>(
            sessionRouteModuleSpecifier
          );
        return getSessionRouteResponse(request);
      },
      DELETE: async ({ request }) => {
        const { deleteSessionRouteResponse } =
          await loadRouteServerModule<SessionRouteModule>(
            sessionRouteModuleSpecifier
          );
        return deleteSessionRouteResponse(request);
      },
    },
  },
});

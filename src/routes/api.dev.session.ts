import { createFileRoute } from '@tanstack/react-router';

import type { DevSessionRouteModule } from '../api/routeBridgeModules';
import { serverRouteModuleSpecifier } from '../api/routeBridgeModules';
import { apiRouteMiddleware, loadRouteServerModule } from './-api-shared';

const devSessionRouteModuleSpecifier = serverRouteModuleSpecifier('devSession');

export const Route = createFileRoute('/api/dev/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request }) => {
        const { createDevSessionRouteResponse } =
          await loadRouteServerModule<DevSessionRouteModule>(
            devSessionRouteModuleSpecifier
          );
        return createDevSessionRouteResponse(request);
      },
      DELETE: async () => {
        const { deleteDevSessionRouteResponse } =
          await loadRouteServerModule<DevSessionRouteModule>(
            devSessionRouteModuleSpecifier
          );
        return deleteDevSessionRouteResponse();
      },
    },
  },
});

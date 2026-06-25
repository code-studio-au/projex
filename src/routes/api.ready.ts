import { createFileRoute } from '@tanstack/react-router';

import type { ReadyRouteModule } from '../api/routeBridgeModules';
import { serverRouteModuleSpecifier } from '../api/routeBridgeModules';
import { loadRouteServerModule, publicApiRouteMiddleware } from './-api-shared';

const readyRouteModuleSpecifier = serverRouteModuleSpecifier('ready');

export const Route = createFileRoute('/api/ready')({
  server: {
    middleware: [publicApiRouteMiddleware],
    handlers: {
      GET: async () => {
        const { getReadyRouteResponse } =
          await loadRouteServerModule<ReadyRouteModule>(
            readyRouteModuleSpecifier
          );
        return getReadyRouteResponse();
      },
    },
  },
});

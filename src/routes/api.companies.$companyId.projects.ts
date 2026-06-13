import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import {
  createProjectServer,
  listProjectsServer,
} from '../server/fns/projects';
import { asCompanyId } from '../types';
import { createProjectInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/projects')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listProjectsServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createProjectInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createProjectServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
    },
  },
});

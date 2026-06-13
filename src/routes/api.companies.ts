import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import {
  createCompanyServer,
  listCompaniesServer,
} from '../server/fns/companies';
import { createCompanyInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(await listCompaniesServer({ context: serverContext }));
      },
      POST: async ({ request, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createCompanyServer({
            context: serverContext,
            input: body,
          })
        );
      },
    },
  },
});

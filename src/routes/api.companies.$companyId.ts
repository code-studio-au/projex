import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  deleteCompanyEndpoint,
  getCompanyEndpoint,
  updateCompanyEndpoint,
} from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: getCompanyEndpoint,
            context,
            input: { companyId: params.companyId },
          })
        ),
      PATCH: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateCompanyEndpoint,
            context,
            input: {
              id: params.companyId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        await executeApiEndpoint({
          endpoint: deleteCompanyEndpoint,
          context,
          input: {
            companyId: params.companyId,
            ...body,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});

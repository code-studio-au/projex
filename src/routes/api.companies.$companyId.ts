import { createFileRoute } from '@tanstack/react-router';

import {
  deleteCompanyBodySchema,
  updateCompanyBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';
import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'getCompanyEndpoint',
            context,
            input: { companyId: params.companyId },
          })
        ),
      PATCH: async ({ context, request, params }) => {
        const body = validateOrThrow(
          updateCompanyBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'updateCompanyEndpoint',
            context,
            input: {
              id: params.companyId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const body = validateOrThrow(
          deleteCompanyBodySchema,
          await readJsonBody(request)
        );
        await executeLazyApiEndpoint({
          specifier: '../server/app/companyEndpoints',
          exportName: 'deleteCompanyEndpoint',
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

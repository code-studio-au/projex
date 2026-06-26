import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultCategoryInputSchema,
  updateCompanyDefaultCategoryInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'listCompanyDefaultCategoriesEndpoint',
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'createCompanyDefaultCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                createCompanyDefaultCategoryInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'updateCompanyDefaultCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                updateCompanyDefaultCategoryInputSchema
              ),
            },
          })
        );
      },
    },
  },
});

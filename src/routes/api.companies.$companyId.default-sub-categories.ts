import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultSubCategoryInputSchema,
  updateCompanyDefaultSubCategoryInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-sub-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'listCompanyDefaultSubCategoriesEndpoint',
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'createCompanyDefaultSubCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                createCompanyDefaultSubCategoryInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'updateCompanyDefaultSubCategoryEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                updateCompanyDefaultSubCategoryInputSchema
              ),
            },
          })
        );
      },
    },
  },
});

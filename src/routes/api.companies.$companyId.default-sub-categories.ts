import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultSubCategoryEndpoint,
  listCompanyDefaultSubCategoriesEndpoint,
  updateCompanyDefaultSubCategoryEndpoint,
} from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-sub-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listCompanyDefaultSubCategoriesEndpoint,
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createCompanyDefaultSubCategoryEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateCompanyDefaultSubCategoryEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});

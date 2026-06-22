import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultCategoryEndpoint,
  listCompanyDefaultCategoriesEndpoint,
  updateCompanyDefaultCategoryEndpoint,
} from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listCompanyDefaultCategoriesEndpoint,
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createCompanyDefaultCategoryEndpoint,
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
            endpoint: updateCompanyDefaultCategoryEndpoint,
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

import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import { createUserInCompanyServer } from '../server/fns/companies';
import { createCompanyUserBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/users')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyUserBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createUserInCompanyServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            name: body.name,
            email: body.email,
            role: body.role,
            sendOnboardingEmail: body.sendOnboardingEmail,
          })
        );
      },
    },
  },
});

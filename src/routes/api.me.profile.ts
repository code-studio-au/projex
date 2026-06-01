import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { updateCurrentUserProfileServer } from '../server/fns/companies';
import { profileUpdateBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      PATCH: async ({ request, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          profileUpdateBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCurrentUserProfileServer({
            context: serverContext,
            input: {
              name: body.name,
            },
          })
        );
      },
    },
  },
});

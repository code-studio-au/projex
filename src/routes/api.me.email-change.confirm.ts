import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { confirmEmailChangeServer } from '../server/fns/account';
import { emailChangeConfirmBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change/confirm')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          emailChangeConfirmBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await confirmEmailChangeServer({
            context: serverContext,
            token: body.token,
          })
        );
      },
    },
  },
});

import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { emailChangeConfirmBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change/confirm')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            emailChangeConfirmBodySchema,
            await readJsonBody(request)
          );
          return api.confirmEmailChange(body.token);
        }),
    },
  },
});

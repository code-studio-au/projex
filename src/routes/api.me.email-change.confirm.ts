import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { emailChangeConfirmBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change/confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = validateOrThrow(
          emailChangeConfirmBodySchema,
          await request.json().catch(() => null)
        );
        return withApi(request, (api) => api.confirmEmailChange(body.token));
      },
    },
  },
});

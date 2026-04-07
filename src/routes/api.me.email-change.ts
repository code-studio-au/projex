import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { emailChangeRequestBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    handlers: {
      GET: async ({ request }) => withApi(request, (api) => api.getPendingEmailChange()),
      POST: async ({ request }) => {
        const body = validateOrThrow(
          emailChangeRequestBodySchema,
          await request.json().catch(() => null)
        );
        return withApi(request, (api) =>
          api.requestEmailChange({
            newEmail: body.newEmail,
          })
        );
      },
      DELETE: async ({ request }) => withApi(request, async (api) => {
        await api.cancelEmailChange();
        return { ok: true };
      }),
    },
  },
});

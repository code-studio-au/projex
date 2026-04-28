import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { emailChangeRequestBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApi(request, (api) => api.getPendingEmailChange()),
      POST: async ({ request }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            emailChangeRequestBodySchema,
            await readJsonBody(request)
          );
          return api.requestEmailChange({
            newEmail: body.newEmail,
          });
        }),
      DELETE: async ({ request }) =>
        withApi(request, async (api) => {
          await api.cancelEmailChange();
          return { ok: true };
        }),
    },
  },
});

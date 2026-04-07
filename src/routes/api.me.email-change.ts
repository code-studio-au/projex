import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    handlers: {
      GET: async ({ request }) => withApi(request, (api) => api.getPendingEmailChange()),
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        return withApi(request, (api) =>
          api.requestEmailChange({
            newEmail:
              body &&
              typeof body === 'object' &&
              'newEmail' in body &&
              typeof body.newEmail === 'string'
                ? body.newEmail
                : '',
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

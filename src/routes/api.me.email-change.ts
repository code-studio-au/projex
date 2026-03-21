import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        return withApi(request, (api) =>
          api.requestEmailChange({
            newEmail: typeof body?.newEmail === 'string' ? body.newEmail : '',
          })
        );
      },
    },
  },
});

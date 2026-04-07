import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/email-change/confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => null);
        return withApi(request, (api) =>
          api.confirmEmailChange(
            body && typeof body === 'object' && 'token' in body && typeof body.token === 'string'
              ? body.token
              : ''
          )
        );
      },
    },
  },
});

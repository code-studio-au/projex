import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/email-change/resend')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withApi(request, (api) => api.resendEmailChange()),
    },
  },
});

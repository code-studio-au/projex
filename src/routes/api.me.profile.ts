import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const body = await request.json();
        return withApi(request, (api) =>
          api.updateCurrentUserProfile({
            name: typeof body?.name === 'string' ? body.name : '',
          })
        );
      },
    },
  },
});

import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const body: unknown = await request.json();
        return withApi(request, (api) =>
          api.updateCurrentUserProfile({
            name:
              body && typeof body === 'object' && 'name' in body && typeof body.name === 'string'
                ? body.name
                : '',
          })
        );
      },
    },
  },
});

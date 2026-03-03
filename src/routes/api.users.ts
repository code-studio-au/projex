import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: ({ request }) => withApi(request, (api) => api.listUsers()),
    },
  },
});

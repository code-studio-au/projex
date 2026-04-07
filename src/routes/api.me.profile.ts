import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { profileUpdateBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const body = validateOrThrow(profileUpdateBodySchema, await request.json());
        return withApi(request, (api) =>
          api.updateCurrentUserProfile({
            name: body.name,
          })
        );
      },
    },
  },
});

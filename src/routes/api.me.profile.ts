import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { profileUpdateBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    handlers: {
      PATCH: async ({ request }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            profileUpdateBodySchema,
            await readJsonBody(request)
          );
          return api.updateCurrentUserProfile({
            name: body.name,
          });
        }),
    },
  },
});

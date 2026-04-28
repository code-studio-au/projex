import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { readJsonBody, withApi } from './-api-shared';
import { asUserId } from '../types';
import { devSessionBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/dev/session')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApi(request, async () => {
          const [{ getDb }, devSession] = await Promise.all([
            import('../server/db/db'),
            import('../server/dev/devSession'),
          ]);
          const { assertDevEndpointsEnabled, createDevSessionSetCookie } =
            devSession;
          assertDevEndpointsEnabled();
          const body = validateOrThrow(
            devSessionBodySchema,
            await readJsonBody(request)
          );
          const userId = body.userId;

          const db = getDb();
          const user = await db
            .selectFrom('users')
            .select(['id', 'disabled'])
            .where('id', '=', asUserId(userId))
            .executeTakeFirst();
          if (!user) throw new AppError('NOT_FOUND', 'Unknown user');
          if (user.disabled)
            throw new AppError('FORBIDDEN', 'User is disabled');

          return new Response(JSON.stringify({ userId: user.id }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': createDevSessionSetCookie(asUserId(user.id)),
            },
          });
        }),
      DELETE: ({ request }) =>
        withApi(request, async () => {
          const { assertDevEndpointsEnabled, clearDevSessionSetCookie } =
            await import('../server/dev/devSession');
          assertDevEndpointsEnabled();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': clearDevSessionSetCookie(),
            },
          });
        }),
    },
  },
});

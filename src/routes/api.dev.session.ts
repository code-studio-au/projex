import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { withApi } from './-api-shared';
import { getDb } from '../server/db/db';
import {
  assertDevEndpointsEnabled,
  clearDevSessionSetCookie,
  createDevSessionSetCookie,
} from '../server/dev/devSession';
import { asUserId } from '../types';

export const Route = createFileRoute('/api/dev/session')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApi(request, async () => {
          assertDevEndpointsEnabled();
          const body = (await request.json()) as { userId?: string };
          const userId = body.userId?.trim();
          if (!userId) {
            throw new AppError('VALIDATION_ERROR', 'userId is required');
          }

          const db = getDb();
          const user = await db
            .selectFrom('users')
            .select(['id', 'disabled'])
            .where('id', '=', asUserId(userId))
            .executeTakeFirst();
          if (!user) throw new AppError('NOT_FOUND', 'Unknown user');
          if (user.disabled) throw new AppError('FORBIDDEN', 'User is disabled');

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

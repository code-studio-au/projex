import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  loadRouteServerModule,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asUserId } from '../types';
import { devSessionBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

type DevSessionUserRow = {
  id: string;
  disabled: boolean;
};

type DevSessionDb = {
  selectFrom(table: 'users'): {
    select(columns: Array<'id' | 'disabled'>): {
      where(
        column: 'id',
        operator: '=',
        value: ReturnType<typeof asUserId>
      ): {
        executeTakeFirst(): Promise<DevSessionUserRow | undefined>;
      };
    };
  };
};

export const Route = createFileRoute('/api/dev/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request }) => {
        requireApiRouteContext(context);
        const [{ getDb }, devSession] = await Promise.all([
          loadRouteServerModule<{ getDb: () => DevSessionDb }>(
            '../server/db/db'
          ),
          loadRouteServerModule<{
            assertDevEndpointsEnabled(): void;
            createDevSessionSetCookie(
              userId: ReturnType<typeof asUserId>
            ): string;
          }>('../server/dev/devSession'),
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
        if (user.disabled) throw new AppError('FORBIDDEN', 'User is disabled');

        return new Response(JSON.stringify({ userId: user.id }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': createDevSessionSetCookie(asUserId(user.id)),
          },
        });
      },
      DELETE: async ({ context }) => {
        requireApiRouteContext(context);
        const { assertDevEndpointsEnabled, clearDevSessionSetCookie } =
          await loadRouteServerModule<{
            assertDevEndpointsEnabled(): void;
            clearDevSessionSetCookie(): string;
          }>('../server/dev/devSession');
        assertDevEndpointsEnabled();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': clearDevSessionSetCookie(),
          },
        });
      },
    },
  },
});

import { AppError } from '../../api/errors';
import { asUserId } from '../../types';
import { devSessionBodySchema } from '../../validation/apiSchemas';
import { validateOrThrow } from '../../validation/validate';
import { getDb } from '../db/db';
import {
  assertDevEndpointsEnabled,
  clearDevSessionSetCookie,
  createDevSessionSetCookie,
} from '../dev/devSession';

type DevSessionUserRow = {
  id: string;
  disabled: boolean;
};

export async function createDevSessionRouteResponse(
  request: Request
): Promise<Response> {
  assertDevEndpointsEnabled();

  const body = validateOrThrow(devSessionBodySchema, await request.json());
  const userId = body.userId;

  const user = (await getDb()
    .selectFrom('users')
    .select(['id', 'disabled'])
    .where('id', '=', asUserId(userId))
    .executeTakeFirst()) as DevSessionUserRow | undefined;

  if (!user) throw new AppError('NOT_FOUND', 'Unknown user');
  if (user.disabled) throw new AppError('FORBIDDEN', 'User is disabled');

  return new Response(JSON.stringify({ userId: user.id }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': createDevSessionSetCookie(asUserId(user.id)),
    },
  });
}

export function deleteDevSessionRouteResponse(): Response {
  assertDevEndpointsEnabled();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearDevSessionSetCookie(),
    },
  });
}

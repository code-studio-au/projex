import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type { User } from '../../types';
import { asUserId } from '../../types';
import { uid } from '../../utils/id';
import { getBetterAuthInstance } from '../auth/betterAuthInstance';
import { getAuthEmailDeliveryMode } from '../auth/email.ts';
import { getDb } from '../db/db';
import { getAuthRedirectUrl, requireBetterAuthBaseUrl } from '../email/urls.ts';

export type BetterAuthUserRow = {
  id: string;
  email: string;
  name: string;
};

type DbLike = ReturnType<typeof getDb>;

export async function findBetterAuthUserByEmail(
  db: DbLike,
  emailNorm: string
): Promise<BetterAuthUserRow | null> {
  const result = await sql<BetterAuthUserRow>`
    select id, email, name
    from ba_user
    where lower(email) = ${emailNorm}
    limit 1
  `.execute(db);
  return result.rows[0] ?? null;
}

export async function createBetterAuthUser(
  db: DbLike,
  email: string,
  name: string
): Promise<BetterAuthUserRow> {
  const userId = uid('bau');
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();
  await sql`
    insert into ba_user (
      id,
      name,
      email,
      "emailVerified",
      image,
      "createdAt",
      "updatedAt"
    ) values (
      ${userId},
      ${name.trim()},
      ${normalizedEmail},
      false,
      null,
      ${now},
      ${now}
    )
  `.execute(db);
  return {
    id: userId,
    email: normalizedEmail,
    name: name.trim(),
  };
}

function getResetPasswordRedirectUrl(): string {
  return getAuthRedirectUrl({
    configuredUrl: process.env.PROJEX_AUTH_RESET_REDIRECT_URL,
    fallbackPath: '/reset-password',
    context: 'preparing invite password setup redirect',
  });
}

export async function requestPasswordSetupEmail(
  email: string
): Promise<'email' | 'log'> {
  const base = requireBetterAuthBaseUrl(
    'requesting invite password setup email'
  );

  const auth = getBetterAuthInstance();
  const endpoint = new URL('/api/auth/request-password-reset', base);
  const res = await auth.handler(
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: base,
        referer: base,
      },
      body: JSON.stringify({
        email,
        redirectTo: getResetPasswordRedirectUrl(),
      }),
    })
  );

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(
      'INTERNAL_ERROR',
      `Could not request invite password setup email (${res.status}): ${text || 'empty response'}`
    );
  }

  return getAuthEmailDeliveryMode();
}

export async function reconcileAppUserToAuthIdentity(args: {
  db: DbLike;
  authUser: BetterAuthUserRow;
  preferredName: string;
}): Promise<User> {
  const db = args.db;
  const emailNorm = args.authUser.email.trim().toLowerCase();
  const existingByEmail = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'disabled'])
    .where(sql<boolean>`lower(email) = ${emailNorm}`)
    .executeTakeFirst();

  if (!existingByEmail) {
    await db
      .insertInto('users')
      .values({
        id: args.authUser.id,
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
        is_global_superadmin: false,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          email: args.authUser.email,
          name: args.preferredName,
        })
      )
      .execute();

    return {
      id: asUserId(args.authUser.id),
      email: args.authUser.email,
      name: args.preferredName,
    };
  }

  if (existingByEmail.id === args.authUser.id) {
    await db
      .updateTable('users')
      .set({
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
      })
      .where('id', '=', args.authUser.id)
      .execute();

    return {
      id: asUserId(args.authUser.id),
      email: args.authUser.email,
      name: args.preferredName,
    };
  }

  const conflictingById = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('id', '=', args.authUser.id)
    .executeTakeFirst();

  if (
    conflictingById &&
    conflictingById.email.trim().toLowerCase() !== emailNorm
  ) {
    throw new AppError(
      'CONFLICT',
      'A different app user already uses the BetterAuth account id for this email'
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values({
        id: args.authUser.id,
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
        is_global_superadmin: false,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          email: args.authUser.email,
          name: args.preferredName,
          disabled: false,
        })
      )
      .execute();

    await sql`
      insert into company_memberships (company_id, user_id, role)
      select company_id, ${args.authUser.id}, role
      from company_memberships
      where user_id = ${existingByEmail.id}
      on conflict (company_id, user_id) do update
      set role = excluded.role
    `.execute(trx);

    await sql`
      insert into project_memberships (project_id, user_id, role)
      select project_id, ${args.authUser.id}, role
      from project_memberships
      where user_id = ${existingByEmail.id}
      on conflict (project_id, user_id) do update
      set role = excluded.role
    `.execute(trx);

    await trx
      .deleteFrom('users')
      .where('id', '=', existingByEmail.id)
      .execute();
  });

  return {
    id: asUserId(args.authUser.id),
    email: args.authUser.email,
    name: args.preferredName,
  };
}

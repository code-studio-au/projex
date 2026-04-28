import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  EmailChangeConfirmResult,
  EmailChangeRequestInput,
  EmailChangeRequestResult,
  PendingEmailChange,
} from '../../api/types';
import { uid } from '../../utils/id';
import { emailSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { sendAuthEmail, type AuthEmailDelivery } from '../auth/email';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type EmailChangeRow = {
  id: string;
  user_id: string;
  current_email: string;
  new_email: string;
  token_hash: string;
  requested_at: string;
  expires_at: string;
  consumed_at: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getEmailChangeRedirectBaseUrl(): string {
  const configured = process.env.PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL?.trim();
  if (configured) return configured;
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Missing BETTER_AUTH_URL while preparing email change verification link'
    );
  }
  return new URL('/verify-email-change', base).toString();
}

function buildEmailChangeVerificationUrl(token: string): string {
  const url = new URL(getEmailChangeRedirectBaseUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

function hasExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

async function requireCurrentUserRow(userId: string) {
  const db = getDb();
  const row = await db
    .selectFrom('users')
    .select(['id', 'email', 'name'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row) throw new AppError('NOT_FOUND', 'Unknown user');
  return row;
}

function toPendingEmailChange(row: EmailChangeRow): PendingEmailChange {
  return {
    newEmail: row.new_email,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
  };
}

async function getPendingEmailChangeRow(
  userId: string
): Promise<EmailChangeRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('email_change_requests')
    .selectAll()
    .where('user_id', '=', userId)
    .where('consumed_at', 'is', null)
    .orderBy('requested_at desc')
    .executeTakeFirst();

  if (!row) return null;
  if (!hasExpired(row.expires_at)) return row;

  await db
    .deleteFrom('email_change_requests')
    .where('id', '=', row.id)
    .execute();
  return null;
}

async function assertEmailAvailable(args: {
  userId: string;
  newEmail: string;
}) {
  const db = getDb();
  const emailNorm = normalizeEmail(args.newEmail);

  const appUser = await db
    .selectFrom('users')
    .select(['id'])
    .where(sql<boolean>`lower(email) = ${emailNorm}`)
    .executeTakeFirst();
  if (appUser && appUser.id !== args.userId) {
    throw new AppError('CONFLICT', 'That email address is not available.');
  }

  const authUser = await sql<{ id: string }>`
    select id
    from ba_user
    where lower(email) = ${emailNorm}
    limit 1
  `.execute(db);
  const authMatch = authUser.rows[0];
  if (authMatch && authMatch.id !== args.userId) {
    throw new AppError('CONFLICT', 'That email address is not available.');
  }
}

async function sendEmailChangeVerificationEmail(args: {
  currentName: string;
  currentEmail: string;
  newEmail: string;
  token: string;
}): Promise<AuthEmailDelivery> {
  const url = buildEmailChangeVerificationUrl(args.token);
  return sendAuthEmail({
    to: args.newEmail,
    subject: 'Confirm your new Projex email address',
    text: [
      `Hi ${args.currentName || args.currentEmail},`,
      '',
      'We received a request to change your Projex login email address.',
      'Confirm the new email address using the link below:',
      url,
      '',
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
    html: [
      `<p>Hi ${args.currentName || args.currentEmail},</p>`,
      '<p>We received a request to change your Projex login email address.</p>',
      `<p><a href="${url}">Confirm your new email address</a></p>`,
      '<p>If you did not request this change, you can ignore this email.</p>',
    ].join(''),
  });
}

async function createPendingEmailChange(args: {
  userId: string;
  currentEmail: string;
  currentName: string;
  newEmail: string;
}): Promise<EmailChangeRequestResult> {
  await assertEmailAvailable({ userId: args.userId, newEmail: args.newEmail });

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const db = getDb();

  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('email_change_requests')
      .where('user_id', '=', args.userId)
      .execute();
    await trx
      .insertInto('email_change_requests')
      .values({
        id: uid('ecr'),
        user_id: args.userId,
        current_email: args.currentEmail,
        new_email: args.newEmail,
        token_hash: tokenHash,
        expires_at: expiresAt,
        consumed_at: null,
      })
      .execute();
  });

  const delivery = await sendEmailChangeVerificationEmail({
    currentName: args.currentName,
    currentEmail: args.currentEmail,
    newEmail: args.newEmail,
    token,
  });

  return {
    newEmail: args.newEmail,
    expiresAt,
    delivery,
  };
}

export async function getPendingEmailChangeServer(args: {
  context: ServerFnContextInput;
}): Promise<PendingEmailChange | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const pending = await getPendingEmailChangeRow(userId);
    return pending ? toPendingEmailChange(pending) : null;
  });
}

export async function requestEmailChangeServer(args: {
  context: ServerFnContextInput;
  input: EmailChangeRequestInput;
}): Promise<EmailChangeRequestResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    validateOrThrow(emailSchema, args.input.newEmail);

    const userId = await requireServerUserId(args.context);
    const currentUser = await requireCurrentUserRow(userId);
    const nextEmail = args.input.newEmail.trim();
    const currentEmailNorm = normalizeEmail(currentUser.email);
    const nextEmailNorm = normalizeEmail(nextEmail);

    if (nextEmailNorm == currentEmailNorm) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Enter a different email address.'
      );
    }

    return createPendingEmailChange({
      userId,
      currentEmail: currentUser.email,
      currentName: currentUser.name,
      newEmail: nextEmail,
    });
  });
}

export async function resendEmailChangeServer(args: {
  context: ServerFnContextInput;
}): Promise<EmailChangeRequestResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const currentUser = await requireCurrentUserRow(userId);
    const pending = await getPendingEmailChangeRow(userId);
    if (!pending) {
      throw new AppError(
        'NOT_FOUND',
        'There is no pending email change to resend. Start a new email change request from your account settings.'
      );
    }

    return createPendingEmailChange({
      userId,
      currentEmail: currentUser.email,
      currentName: currentUser.name,
      newEmail: pending.new_email,
    });
  });
}

export async function cancelEmailChangeServer(args: {
  context: ServerFnContextInput;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    await db
      .deleteFrom('email_change_requests')
      .where('user_id', '=', userId)
      .execute();
  });
}

export async function confirmEmailChangeServer(args: {
  context: ServerFnContextInput;
  token: string;
}): Promise<EmailChangeConfirmResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const token = args.token.trim();
    if (!token) {
      throw new AppError('VALIDATION_ERROR', 'Email change token is required.');
    }

    const db = getDb();
    const tokenHash = hashToken(token);
    const nowIso = new Date().toISOString();
    const pending = await db
      .selectFrom('email_change_requests')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('consumed_at', 'is', null)
      .executeTakeFirst();

    if (!pending || pending.expires_at <= nowIso) {
      throw new AppError(
        'CONFLICT',
        'This email change link is invalid or has expired. Request a new verification email from your account settings.'
      );
    }

    await assertEmailAvailable({
      userId: pending.user_id,
      newEmail: pending.new_email,
    });

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ email: pending.new_email })
        .where('id', '=', pending.user_id)
        .execute();

      await sql`
        update ba_user
        set email = ${pending.new_email}
        where id = ${pending.user_id}
      `.execute(trx);

      await trx
        .deleteFrom('email_change_requests')
        .where('id', '=', pending.id)
        .execute();
    });

    return {
      email: pending.new_email,
      previousEmail: pending.current_email,
    };
  });
}

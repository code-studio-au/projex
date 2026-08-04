import assert from 'node:assert/strict';
import test from 'node:test';

import { splitSetCookieHeader } from 'better-auth/cookies';

import {
  getBetterAuthInstance,
  provisionBetterAuthCredentialUser,
} from '../src/server/auth/betterAuthInstance.ts';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

const authBaseUrl = process.env.BETTER_AUTH_URL?.trim() ?? '';
const canRun = !!integrationDatabaseUrl && !!authBaseUrl;

function authUrl(path: string) {
  return new URL(`/api/auth/${path}`, authBaseUrl).toString();
}

function requestHeaders(cookie?: string) {
  return {
    'content-type': 'application/json',
    origin: new URL(authBaseUrl).origin,
    ...(cookie ? { cookie } : {}),
  };
}

function responseCookies(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected Better Auth to set a session cookie');
  return splitSetCookieHeader(setCookie)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}

test(
  'password reset atomically replaces the browser account and clears prior sessions for the reset account',
  { skip: !canRun },
  async () => {
    const db = createIntegrationDb();
    const targetEmail = 'itest-reset-target@example.com';
    const otherEmail = 'itest-reset-other@example.com';
    const initialPassword = 'Initial-password-1234';
    const nextPassword = 'Updated-password-5678';
    const resetToken = 'itest-reset-account-switch-token';
    const verificationIdentifier = `reset-password:${resetToken}`;
    let targetUserId: string | null = null;
    let otherUserId: string | null = null;

    async function cleanup() {
      const userRows = await db
        .selectFrom('ba_user')
        .select('id')
        .where('email', 'in', [targetEmail, otherEmail])
        .execute();
      const userIds = userRows.map((row) => row.id);
      if (userIds.length) {
        await db
          .deleteFrom('ba_session')
          .where('userId', 'in', userIds)
          .execute();
        await db
          .deleteFrom('ba_account')
          .where('userId', 'in', userIds)
          .execute();
        await db.deleteFrom('ba_user').where('id', 'in', userIds).execute();
      }
      await db
        .deleteFrom('ba_verification')
        .where('identifier', '=', verificationIdentifier)
        .execute();
    }

    try {
      await cleanup();
      const target = await provisionBetterAuthCredentialUser({
        email: targetEmail,
        password: initialPassword,
        name: 'Reset Target',
      });
      const other = await provisionBetterAuthCredentialUser({
        email: otherEmail,
        password: initialPassword,
        name: 'Other Browser Account',
      });
      targetUserId = target.id;
      otherUserId = other.id;

      const auth = getBetterAuthInstance();
      const otherSignIn = await auth.handler(
        new Request(authUrl('sign-in/email'), {
          method: 'POST',
          headers: requestHeaders(),
          body: JSON.stringify({
            email: otherEmail,
            password: initialPassword,
          }),
        })
      );
      assert.equal(otherSignIn.status, 200);
      const otherBrowserCookie = responseCookies(otherSignIn);

      await db
        .insertInto('ba_verification')
        .values({
          id: 'itest-reset-account-switch-verification',
          identifier: verificationIdentifier,
          value: target.id,
          expiresAt: new Date(Date.now() + 60_000),
        })
        .execute();

      const resetResponse = await auth.handler(
        new Request(authUrl('reset-password'), {
          method: 'POST',
          headers: requestHeaders(otherBrowserCookie),
          body: JSON.stringify({
            token: resetToken,
            newPassword: nextPassword,
          }),
        })
      );
      assert.equal(resetResponse.status, 200);
      assert.deepEqual(await resetResponse.clone().json(), { status: true });
      const switchedBrowserCookie = responseCookies(resetResponse);

      const sessionResponse = await auth.handler(
        new Request(authUrl('get-session'), {
          headers: requestHeaders(switchedBrowserCookie),
        })
      );
      assert.equal(sessionResponse.status, 200);
      const session = (await sessionResponse.json()) as {
        user?: { id?: string };
      };
      assert.equal(session.user?.id, target.id);
      assert.notEqual(session.user?.id, other.id);

      const [targetSessionCount, otherSessionCount] = await Promise.all([
        db
          .selectFrom('ba_session')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('userId', '=', target.id)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('ba_session')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('userId', '=', other.id)
          .executeTakeFirstOrThrow(),
      ]);
      assert.equal(Number(targetSessionCount.count), 1);
      assert.ok(Number(otherSessionCount.count) >= 1);
    } finally {
      if (targetUserId || otherUserId) await cleanup();
      await db.destroy();
    }
  }
);

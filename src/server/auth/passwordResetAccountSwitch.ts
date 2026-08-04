import { createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

type ResetAccountHookContext = {
  resetAccountUserId?: string;
};

function resetTokenFromContext(context: {
  body?: unknown;
  query?: unknown;
}): string | null {
  const body = context.body as { token?: unknown } | undefined;
  const query = context.query as { token?: unknown } | undefined;
  const token = body?.token ?? query?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

function resetSucceeded(returned: unknown): boolean {
  return (
    !!returned &&
    typeof returned === 'object' &&
    'status' in returned &&
    returned.status === true
  );
}

/**
 * A valid password-reset token is already a single-use proof of account
 * ownership. Capture its user id before Better Auth consumes the token, then
 * create one fresh session only after the reset endpoint reports success.
 * Setting the normal signed session cookie replaces any account currently
 * active in this browser without exposing an email address in the reset URL.
 */
export function createPasswordResetAccountSwitchHooks() {
  return {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== '/reset-password') return;
      const token = resetTokenFromContext(context);
      if (!token) return;

      const verification =
        await context.context.internalAdapter.findVerificationValue(
          `reset-password:${token}`
        );
      if (!verification) return;

      return {
        context: {
          resetAccountUserId: verification.value,
        },
      };
    }),
    after: createAuthMiddleware(async (context) => {
      if (
        context.path !== '/reset-password' ||
        !resetSucceeded(context.context.returned)
      ) {
        return;
      }

      const userId = (context as typeof context & ResetAccountHookContext)
        .resetAccountUserId;
      if (!userId) return;

      const user = await context.context.internalAdapter.findUserById(userId);
      if (!user) return;
      const session =
        await context.context.internalAdapter.createSession(userId);

      await setSessionCookie(context, { session, user });
    }),
  };
}

import { getBetterAuthInstance } from './betterAuthInstance.ts';
import { betterAuthSignUpResponseSchema } from '../../validation/responseSchemas';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function run() {
  const email = requireEnv('PROJEX_AUTH_EMAIL');
  const password = requireEnv('PROJEX_AUTH_PASSWORD');
  const name = process.env.PROJEX_AUTH_NAME?.trim() || email;

  const auth = getBetterAuthInstance();
  const response = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
    },
  });
  const payload = betterAuthSignUpResponseSchema.parse(response);
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: payload.user.id,
        email: payload.user.email ?? email,
        name: payload.user.name ?? name,
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

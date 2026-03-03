import { getBetterAuthInstance } from './betterAuthInstance.ts';

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

  const payload = response as {
    user?: { id?: string; email?: string; name?: string };
  };
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: payload.user?.id ?? null,
        email: payload.user?.email ?? email,
        name: payload.user?.name ?? name,
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

import { provisionBetterAuthCredentialUser } from './betterAuthInstance.ts';
import { loadEnvFiles } from '../envFiles.ts';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function run() {
  loadEnvFiles();

  const email = requireEnv('PROJEX_AUTH_EMAIL');
  const password = requireEnv('PROJEX_AUTH_PASSWORD');
  const name = process.env.PROJEX_AUTH_NAME?.trim() || email;

  const user = await provisionBetterAuthCredentialUser({
    email,
    password,
    name,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: user.id,
        email: user.email,
        name: user.name,
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

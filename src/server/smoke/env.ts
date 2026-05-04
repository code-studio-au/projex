import { loadEnvFiles } from '../envFiles.ts';

export function loadSmokeEnvFiles() {
  loadEnvFiles([
    { fileName: '.env.local' },
    {
      fileName: '.env.smoke.local',
      // Allow the dedicated smoke overrides file to win for smoke-specific vars
      // without clobbering unrelated process env or app config loaded earlier.
      override: (key) => key.startsWith('PROJEX_SMOKE_'),
    },
  ]);
}

export function getSmokeBaseUrl(requestOrigin = 'http://localhost:3000') {
  loadSmokeEnvFiles();
  return (process.env.PROJEX_SMOKE_BASE_URL?.trim() || requestOrigin).replace(
    /\/+$/,
    ''
  );
}

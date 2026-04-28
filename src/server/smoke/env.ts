import fs from 'node:fs';
import path from 'node:path';

const loadedEnvFiles = new Set<string>();

export function loadSmokeEnvFiles() {
  for (const envFileName of ['.env.local', '.env.smoke.local']) {
    const filePath = path.resolve(process.cwd(), envFileName);
    if (loadedEnvFiles.has(filePath) || !fs.existsSync(filePath)) continue;
    loadedEnvFiles.add(filePath);
    const isSmokeOverridesFile = envFileName === '.env.smoke.local';
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Allow the dedicated smoke overrides file to win for smoke-specific vars
      // without clobbering unrelated process env or app config loaded earlier.
      if (isSmokeOverridesFile && key.startsWith('PROJEX_SMOKE_')) {
        process.env[key] = value;
        continue;
      }

      if (process.env[key] != null) continue;
      process.env[key] = value;
    }
  }
}

export function getSmokeBaseUrl(requestOrigin = 'http://localhost:3000') {
  loadSmokeEnvFiles();
  return (process.env.PROJEX_SMOKE_BASE_URL?.trim() || requestOrigin).replace(
    /\/+$/,
    ''
  );
}

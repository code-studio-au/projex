import fs from 'node:fs';
import path from 'node:path';

type EnvFileConfig = {
  fileName: string;
  override?: (key: string) => boolean;
};

const loadedEnvFiles = new Set<string>();
const envFileKeys = new Set<string>();

export function loadEnvFiles(
  files: EnvFileConfig[] = [{ fileName: '.env.local' }]
) {
  for (const config of files) {
    const filePath = path.resolve(process.cwd(), config.fileName);
    if (loadedEnvFiles.has(filePath) || !fs.existsSync(filePath)) continue;
    loadedEnvFiles.add(filePath);

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

      const wasLoadedFromEnvFile = envFileKeys.has(key);
      if (config.override?.(key) && wasLoadedFromEnvFile) {
        process.env[key] = value;
        envFileKeys.add(key);
        continue;
      }

      if (process.env[key] == null) {
        process.env[key] = value;
        envFileKeys.add(key);
      }
    }
  }
}

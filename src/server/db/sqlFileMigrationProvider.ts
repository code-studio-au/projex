import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CompiledQuery } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';

export class SqlFileMigrationProvider implements MigrationProvider {
  private readonly migrationFolder: string;

  constructor(migrationFolder: string) {
    this.migrationFolder = migrationFolder;
  }

  async getMigrations(): Promise<Record<string, Migration>> {
    const entries = await fs.readdir(this.migrationFolder, {
      withFileTypes: true,
    });
    const migrationNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    return Object.fromEntries(
      migrationNames.map((migrationName) => [
        migrationName,
        {
          up: async (db) => {
            const sqlText = await fs.readFile(
              path.join(this.migrationFolder, migrationName),
              'utf8'
            );
            await db.executeQuery(CompiledQuery.raw(sqlText));
          },
        } satisfies Migration,
      ])
    );
  }
}

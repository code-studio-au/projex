import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const boundaries = [
  {
    sourcePath: 'src/components/ProjectWorkspace.tsx',
    lazyModules: [
      './TransactionsPanel',
      './PowerBiImporterPanel',
      './ProjectSettingsPanel',
    ],
  },
  {
    sourcePath: 'src/pages/CompanyDashboardPage.tsx',
    lazyModules: [
      '../components/CompanySummaryPanel',
      '../components/CompanySettingsPanel',
    ],
  },
];

describe('inactive dashboard panel boundaries', () => {
  for (const boundary of boundaries) {
    test(`${boundary.sourcePath} keeps heavy panels behind lazy imports`, async () => {
      const source = await readFile(
        path.resolve(process.cwd(), boundary.sourcePath),
        'utf8'
      );

      for (const lazyModule of boundary.lazyModules) {
        const escapedModule = lazyModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(source).toMatch(
          new RegExp(
            `lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(['"]${escapedModule}['"]\\)\\s*\\)`
          )
        );
        expect(source).not.toContain(`from '${lazyModule}'`);
        expect(source).not.toContain(`from "${lazyModule}"`);
      }
    });
  }
});

export type FrameworkCohort = {
  schemaVersion: number;
  selectedAt: string;
  minimumReleaseAgeMinutes: number;
  directPackages: Record<
    string,
    {
      section: 'dependencies' | 'devDependencies';
      specifier: string;
      lockVersion: string;
      publishedAt: string;
    }
  >;
  singleVersionResolutions: Record<string, string>;
};

export declare function verifyFrameworkCohort(input: {
  cohort: FrameworkCohort;
  lockfile: string;
  packageJson: Record<string, Record<string, string> | unknown>;
  workspaceConfig: string;
}): void;

export declare function verifyFrameworkApiUsage(
  sources: Array<{ path: string; source: string }>
): void;

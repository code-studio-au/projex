export type SmokeSectionId =
  | 'basics'
  | 'appPages'
  | 'emailChange'
  | 'temporaryData'
  | 'inviteFlow'
  | 'privacyChecks';

export type SmokeStepStatus = 'passed' | 'failed' | 'skipped';
export type SmokeSectionStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped';

export type SmokeStepResult = {
  id: string;
  label: string;
  status: SmokeStepStatus;
  durationMs: number;
  error?: string;
  detail?: string;
};

export type SmokeSectionResult = {
  sectionId: SmokeSectionId;
  label: string;
  status: Exclude<SmokeSectionStatus, 'idle' | 'running'>;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: SmokeStepResult[];
};

export const smokeSectionDefinitions: Array<{
  id: SmokeSectionId;
  label: string;
  description: string;
}> = [
  {
    id: 'basics',
    label: 'Basics',
    description:
      'Checks health, readiness, login, auth session setup, password reset request, and baseline company/project loading.',
  },
  {
    id: 'appPages',
    label: 'App Pages',
    description:
      'Loads the main authenticated pages and verifies a project page still renders on refresh.',
  },
  {
    id: 'emailChange',
    label: 'Email Change',
    description:
      'Exercises verified email change request, pending state, resend, cancel, and pending-state cleanup.',
  },
  {
    id: 'temporaryData',
    label: 'Temporary Data',
    description:
      'Creates and removes a temporary category and budget so write paths get exercised safely.',
  },
  {
    id: 'inviteFlow',
    label: 'Invite Flow',
    description:
      'Invites a user to a company and checks the immediate resend-invite path, including rate-limit handling.',
  },
  {
    id: 'privacyChecks',
    label: 'Privacy Checks',
    description:
      'Verifies the project-level superadmin access toggle blocks superadmin visibility while keeping the admin path intact.',
  },
];

export type SmokeSectionId =
  | 'basics'
  | 'appPages'
  | 'emailChange'
  | 'temporaryData'
  | 'inviteFlow'
  | 'privacyChecks';

export type SmokeStepStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped';
export type SmokeSectionStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped';

export type SmokeStepTemplate = {
  id: string;
  label: string;
};

export type SmokeStepResult = {
  id: string;
  label: string;
  status: Exclude<SmokeStepStatus, 'idle' | 'running'>;
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

export type SmokeStepStreamEvent =
  | {
      type: 'step';
      sectionId: SmokeSectionId;
      step: SmokeStepResult;
    }
  | {
      type: 'status';
      sectionId: SmokeSectionId;
      message: string;
    }
  | {
      type: 'result';
      result: SmokeSectionResult;
    }
  | {
      type: 'error';
      message: string;
    };

export const smokeSectionDefinitions: Array<{
  id: SmokeSectionId;
  label: string;
  description: string;
  steps: SmokeStepTemplate[];
}> = [
  {
    id: 'basics',
    label: 'Basics',
    description:
      'Checks health, readiness, login, auth session setup, password reset request, and baseline company/project loading.',
    steps: [
      { id: 'health', label: 'Checking health endpoint' },
      { id: 'ready', label: 'Checking readiness endpoint' },
      { id: 'login-page', label: 'Checking login page HTML' },
      { id: 'reset-seed', label: 'Skipping or resetting dev seed data' },
      { id: 'auth-login', label: 'Logging in with smoke credentials' },
      { id: 'dev-login', label: 'Using dev session login' },
      { id: 'session', label: 'Checking current session' },
      { id: 'password-reset', label: 'Requesting password reset email' },
      { id: 'companies', label: 'Loading companies' },
      { id: 'projects', label: 'Loading projects for a company' },
    ],
  },
  {
    id: 'appPages',
    label: 'App Pages',
    description:
      'Loads the main authenticated pages and verifies a project page still renders on refresh.',
    steps: [
      { id: 'login-page', label: 'Checking login page HTML' },
      { id: 'reset-seed', label: 'Skipping or resetting dev seed data' },
      { id: 'auth-login', label: 'Logging in with smoke credentials' },
      { id: 'dev-login', label: 'Using dev session login' },
      { id: 'session', label: 'Checking current session' },
      { id: 'password-reset', label: 'Requesting password reset email' },
      { id: 'companies', label: 'Loading companies' },
      { id: 'projects', label: 'Loading projects for a company' },
      { id: 'companies-page', label: 'Checking companies page HTML' },
      { id: 'account-page', label: 'Checking account page HTML' },
      { id: 'company-page', label: 'Checking company page HTML' },
      { id: 'project-page', label: 'Checking project page HTML' },
      { id: 'project-refresh', label: 'Checking project refresh HTML' },
      { id: 'transactions', label: 'Loading transactions for the selected project' },
    ],
  },
  {
    id: 'emailChange',
    label: 'Email Change',
    description:
      'Exercises verified email change request, pending state, resend, cancel, and pending-state cleanup.',
    steps: [
      { id: 'login-page', label: 'Checking login page HTML' },
      { id: 'reset-seed', label: 'Skipping or resetting dev seed data' },
      { id: 'auth-login', label: 'Logging in with smoke credentials' },
      { id: 'dev-login', label: 'Using dev session login' },
      { id: 'session', label: 'Checking current session' },
      { id: 'password-reset', label: 'Requesting password reset email' },
      { id: 'email-change-request', label: 'Requesting verified email change' },
      { id: 'email-change-pending', label: 'Checking pending email change' },
      { id: 'email-change-resend', label: 'Resending email change verification' },
      { id: 'email-change-cancel', label: 'Cancelling pending email change' },
      { id: 'email-change-cleared', label: 'Checking pending email change was cleared' },
    ],
  },
  {
    id: 'temporaryData',
    label: 'Temporary Data',
    description:
      'Creates and removes a temporary category and budget so write paths get exercised safely.',
    steps: [
      { id: 'login-page', label: 'Checking login page HTML' },
      { id: 'reset-seed', label: 'Skipping or resetting dev seed data' },
      { id: 'auth-login', label: 'Logging in with smoke credentials' },
      { id: 'dev-login', label: 'Using dev session login' },
      { id: 'session', label: 'Checking current session' },
      { id: 'password-reset', label: 'Requesting password reset email' },
      { id: 'companies', label: 'Loading companies' },
      { id: 'projects', label: 'Loading projects for a company' },
      { id: 'create-category', label: 'Creating a temporary category' },
      { id: 'create-budget', label: 'Creating a temporary budget' },
      { id: 'delete-budget', label: 'Deleting the temporary budget' },
      { id: 'delete-category', label: 'Deleting the temporary category' },
    ],
  },
  {
    id: 'inviteFlow',
    label: 'Invite Flow',
    description:
      'Invites a user to a company and checks the immediate resend-invite path, including rate-limit handling.',
    steps: [
      { id: 'login-page', label: 'Checking login page HTML' },
      { id: 'reset-seed', label: 'Skipping or resetting dev seed data' },
      { id: 'auth-login', label: 'Logging in with smoke credentials' },
      { id: 'dev-login', label: 'Using dev session login' },
      { id: 'session', label: 'Checking current session' },
      { id: 'password-reset', label: 'Requesting password reset email' },
      { id: 'companies', label: 'Loading companies' },
      { id: 'projects', label: 'Loading projects for a company' },
      { id: 'invite-user', label: 'Inviting a user to the company' },
      { id: 'resend-invite', label: 'Attempting immediate invite resend' },
      { id: 'invite-flow-skipped', label: 'Skipping invite flow when invite smoke vars are absent' },
    ],
  },
  {
    id: 'privacyChecks',
    label: 'Privacy Checks',
    description:
      'Verifies the project-level superadmin access toggle blocks superadmin visibility while keeping the admin path intact.',
    steps: [
      { id: 'privacy-admin-login', label: 'Logging in as admin' },
      { id: 'privacy-admin-companies', label: 'Loading admin companies' },
      { id: 'privacy-admin-projects', label: 'Loading admin projects' },
      { id: 'privacy-enable-access', label: 'Enabling superadmin access for the project' },
      { id: 'privacy-disable-access', label: 'Disabling superadmin access for the project' },
      { id: 'privacy-admin-page', label: 'Confirming admin can still view the project page' },
      { id: 'privacy-superadmin-login', label: 'Logging in as superadmin' },
      { id: 'privacy-superadmin-list', label: 'Checking the project is hidden from the superadmin list' },
      { id: 'privacy-superadmin-fetch', label: 'Checking the project cannot be fetched by superadmin' },
      { id: 'privacy-admin-relogin', label: 'Relogging in as admin' },
      { id: 'privacy-restore', label: 'Restoring the original superadmin access setting' },
      { id: 'privacy-skipped', label: 'Skipping privacy flow when privacy smoke vars are absent' },
    ],
  },
];

import {
  emailChangeRequestResponseSchema,
  pendingEmailChangeResponseSchema,
} from '../../../validation/responseSchemas.ts';
import {
  assertHtmlOk,
  assertOk,
  authenticatePrimaryUser,
  loadPrimaryCompanyAndProject,
  parseBody,
  projectLabel,
  type Recorder,
  type SmokeHttpClient,
} from '../shared.ts';

export async function runBasicsSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await recorder.step('health', 'Checking health endpoint', async () => {
    assertOk(await client.request('/api/health'), 'health');
  });
  await recorder.step('ready', 'Checking readiness endpoint', async () => {
    assertOk(await client.request('/api/ready'), 'ready');
  });
  await authenticatePrimaryUser(recorder, client, baseUrl, {
    includePasswordReset: true,
  });
  await loadPrimaryCompanyAndProject(recorder, client);
}

export async function runAppPagesSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );

  await recorder.step(
    'companies-page',
    'Checking companies page HTML',
    async () => {
      assertHtmlOk(await client.requestHtml('/companies'), 'companies page');
    }
  );
  await recorder.step(
    'account-page',
    'Checking account page HTML',
    async () => {
      assertHtmlOk(await client.requestHtml('/account'), 'account page');
    }
  );
  await recorder.step(
    'company-page',
    'Checking company page HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(`/c/${encodeURIComponent(company.id)}`),
        'company page'
      );
    }
  );
  await recorder.step(
    'project-page',
    'Checking project page HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(
          `/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`
        ),
        'project page'
      );
    }
  );
  await recorder.step(
    'project-refresh',
    'Checking project refresh HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(
          `/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`
        ),
        'project refresh'
      );
    }
  );
  await recorder.step(
    'transactions',
    `Loading transactions for project ${projectLabel(project)}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        ),
        'transactions list'
      );
    }
  );
}

export async function runEmailChangeSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  const emailChangeTo = process.env.PROJEX_SMOKE_EMAIL_CHANGE_TO?.trim();
  await authenticatePrimaryUser(recorder, client, baseUrl);

  if (!emailChangeTo) {
    recorder.skip(
      'email-change-skipped',
      'Skipping email-change flow',
      'Set PROJEX_SMOKE_EMAIL_CHANGE_TO in .env.smoke.local to enable this section.'
    );
    return;
  }

  await recorder.step(
    'email-change-request',
    `Requesting verified email change to ${emailChangeTo}`,
    async () => {
      const result = await client.requestWith429Retry(
        '/api/me/email-change',
        {
          method: 'POST',
          body: JSON.stringify({ newEmail: emailChangeTo }),
        },
        { label: 'request email change' }
      );
      assertOk(result, 'request email change');
    }
  );
  await recorder.step(
    'email-change-pending',
    'Checking pending email change',
    async () => {
      const result = await client.request('/api/me/email-change');
      assertOk(result, 'get pending email change');
      const body = parseBody(
        pendingEmailChangeResponseSchema,
        result.body,
        'get pending email change'
      );
      if (body?.newEmail !== emailChangeTo) {
        throw new Error(`Pending email change did not match ${emailChangeTo}`);
      }
    }
  );
  await recorder.step(
    'email-change-resend',
    `Resending email change verification to ${emailChangeTo}`,
    async () => {
      const result = await client.requestWith429Retry(
        '/api/me/email-change/resend',
        { method: 'POST' },
        { label: 'resend email change' }
      );
      assertOk(result, 'resend email change');
      const body = parseBody(
        emailChangeRequestResponseSchema,
        result.body,
        'resend email change'
      );
      if (body.newEmail !== emailChangeTo) {
        throw new Error(`Resent email change did not match ${emailChangeTo}`);
      }
    }
  );
  await recorder.step(
    'email-change-cancel',
    'Cancelling pending email change',
    async () => {
      const result = await client.request('/api/me/email-change', {
        method: 'DELETE',
      });
      assertOk(result, 'cancel email change');
    }
  );
  await recorder.step(
    'email-change-cleared',
    'Checking pending email change was cleared',
    async () => {
      const result = await client.request('/api/me/email-change');
      assertOk(result, 'get pending email change after cancel');
      const body = parseBody(
        pendingEmailChangeResponseSchema,
        result.body,
        'get pending email change after cancel'
      );
      if (body !== null) {
        throw new Error('Pending email change was still present after cancel');
      }
    }
  );
}

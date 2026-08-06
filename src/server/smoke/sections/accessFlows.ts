import {
  apiErrorResponseSchema,
  companiesResponseSchema,
  companyMembershipsResponseSchema,
  companyExportJobResponseSchema,
  companyUserInviteResultResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
} from '../../../validation/responseSchemas.ts';
import {
  assertHtmlOk,
  assertOk,
  authenticatePrimaryUser,
  companyLabel,
  isInviteResendRateLimited,
  loadPrimaryCompanyAndProject,
  parseBody,
  projectLabel,
  sleep,
  type Recorder,
  type SmokeHttpClient,
  userLabel,
} from '../shared.ts';

export async function runInviteFlowSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  const inviteEmail = process.env.PROJEX_SMOKE_INVITE_EMAIL?.trim();
  const inviteName =
    process.env.PROJEX_SMOKE_INVITE_NAME?.trim() || 'Smoke Invite';
  const inviteRole = process.env.PROJEX_SMOKE_INVITE_ROLE?.trim() || 'member';

  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company } = await loadPrimaryCompanyAndProject(recorder, client);

  if (!inviteEmail) {
    recorder.skip(
      'invite-flow-skipped',
      'Skipping invite flow',
      'Set PROJEX_SMOKE_INVITE_EMAIL in .env.smoke.local to enable this section.'
    );
    return;
  }

  const invite = await recorder.step(
    'invite-user',
    `Inviting ${inviteEmail} to company ${companyLabel(company)} as ${inviteRole}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: inviteName,
            email: inviteEmail,
            role: inviteRole,
            sendOnboardingEmail: true,
          }),
        }
      );
      assertOk(result, 'invite user');
      const body = parseBody(
        companyUserInviteResultResponseSchema,
        result.body,
        'invite user'
      );
      if (!body.onboardingEmailSent) {
        throw new Error(
          'Brand-new invited user did not trigger an onboarding email.'
        );
      }
      if (!body.membershipCreated) {
        throw new Error(
          'Brand-new invited user did not create a company membership.'
        );
      }
      return body;
    }
  );

  const invitedUserId = invite?.user?.id;
  if (!invitedUserId) {
    throw new Error(
      `Invite user did not return a user id: ${JSON.stringify(invite)}`
    );
  }

  await recorder.step(
    'reject-existing-company-user',
    `Rejecting an add-user request for existing company email ${inviteEmail}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: inviteName,
            email: inviteEmail,
            role: inviteRole,
            sendOnboardingEmail: false,
          }),
        }
      );
      if (result.res.status !== 422) {
        throw new Error(
          `existing company email returned ${result.res.status}, expected 422: ${JSON.stringify(result.body)}`
        );
      }
      const error = parseBody(
        apiErrorResponseSchema,
        result.body,
        'reject existing company email'
      );
      if (error.code !== 'VALIDATION_ERROR') {
        throw new Error(
          `Existing company email returned an unexpected error: ${JSON.stringify(error)}`
        );
      }

      const membershipsResult = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/memberships`
      );
      assertOk(
        membershipsResult,
        'list memberships after rejected duplicate email'
      );
      const memberships = parseBody(
        companyMembershipsResponseSchema,
        membershipsResult.body,
        'list memberships after rejected duplicate email'
      );
      const membership = memberships.find(
        (candidate) => candidate.userId === invitedUserId
      );
      if (membership?.role !== inviteRole) {
        throw new Error(
          `Rejected duplicate email changed the membership: ${JSON.stringify(membership)}`
        );
      }
    }
  );

  await recorder.step(
    'resend-invite',
    `Attempting immediate resend for invited user ${inviteEmail}`,
    async () => {
      const resend = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users/${encodeURIComponent(invitedUserId)}/invite`,
        { method: 'POST' }
      );
      if (isInviteResendRateLimited(resend)) return;
      assertOk(resend, 'resend invite');
    }
  );
}

export async function runExportFlowSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company } = await loadPrimaryCompanyAndProject(recorder, client);

  const exportJob = await recorder.step(
    'start-export',
    `Starting export for company ${companyLabel(company)}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/export-jobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'all',
            detail: 'full',
            notifyWhenReady: false,
          }),
        }
      );
      if (result.res.status !== 202) {
        throw new Error(
          `Expected export job creation to return 202, got ${result.res.status}.`
        );
      }
      return parseBody(
        companyExportJobResponseSchema,
        result.body,
        'start export job'
      );
    }
  );

  const completedJob = await recorder.step(
    'poll-export',
    `Waiting for export job ${exportJob.id} to complete`,
    async () => {
      const maxAttempts = 45;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await client.request(
          `/api/export-jobs/${encodeURIComponent(exportJob.id)}`
        );
        assertOk(result, 'poll export job');
        const job = parseBody(
          companyExportJobResponseSchema,
          result.body,
          'poll export job'
        );

        if (job.status === 'completed') {
          if (!job.downloadPath) {
            throw new Error('Completed export job did not include a download.');
          }
          if (!job.fileName) {
            throw new Error(
              'Completed export job did not include a file name.'
            );
          }
          if (typeof job.fileSizeBytes !== 'number' || job.fileSizeBytes <= 0) {
            throw new Error(
              'Completed export job did not include a positive file size.'
            );
          }
          return job;
        }

        if (job.status === 'failed') {
          throw new Error(job.errorMessage ?? 'Export job failed.');
        }

        if (job.status === 'expired') {
          throw new Error('Export job expired before smoke download.');
        }

        if (attempt === maxAttempts) {
          throw new Error(
            `Export job ${exportJob.id} did not complete within ${(maxAttempts * 2).toString()} seconds.`
          );
        }

        await sleep(2000);
      }

      throw new Error(`Export job ${exportJob.id} did not complete.`);
    }
  );

  await recorder.step(
    'download-export',
    `Downloading workbook ${completedJob.fileName ?? completedJob.id}`,
    async () => {
      const result = await client.requestBinary(
        completedJob.downloadPath ??
          `/api/export-jobs/${encodeURIComponent(completedJob.id)}/download`
      );
      if (!result.res.ok) {
        throw new Error(`Download failed with ${result.res.status}.`);
      }
      const contentType = result.res.headers.get('content-type') ?? '';
      if (
        !contentType.includes(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ) {
        throw new Error(
          `Unexpected export content type: ${contentType || 'missing'}.`
        );
      }
      const contentDisposition =
        result.res.headers.get('content-disposition') ?? '';
      if (!contentDisposition.includes('attachment;')) {
        throw new Error('Export download was missing attachment headers.');
      }
      const bytes = result.bytes;
      if (bytes.byteLength < 4) {
        throw new Error('Downloaded workbook was unexpectedly small.');
      }
      if (
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b ||
        bytes[2] !== 0x03 ||
        bytes[3] !== 0x04
      ) {
        throw new Error('Downloaded workbook did not look like an XLSX zip.');
      }
      if (
        typeof completedJob.fileSizeBytes === 'number' &&
        completedJob.fileSizeBytes !== bytes.byteLength
      ) {
        throw new Error(
          `Downloaded workbook size ${bytes.byteLength} did not match recorded size ${completedJob.fileSizeBytes}.`
        );
      }
    }
  );
}

export async function runPrivacyChecksSection(
  recorder: Recorder,
  client: SmokeHttpClient
) {
  const privacyAdminEmail =
    process.env.PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL?.trim();
  const privacyAdminPassword =
    process.env.PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD?.trim();
  const privacySuperadminEmail =
    process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL?.trim();
  const privacySuperadminPassword =
    process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD?.trim();

  if (
    !privacyAdminEmail ||
    !privacyAdminPassword ||
    !privacySuperadminEmail ||
    !privacySuperadminPassword
  ) {
    recorder.skip(
      'privacy-skipped',
      'Skipping privacy toggle flow',
      'Set PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL, PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD, PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL, and PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD in .env.smoke.local to enable this section.'
    );
    return;
  }

  await recorder.step(
    'privacy-admin-login',
    `Logging in as admin ${userLabel(privacyAdminEmail, 'admin')}`,
    async () => {
      await client.loginWithEmailPassword(
        privacyAdminEmail,
        privacyAdminPassword,
        'privacy admin login'
      );
    }
  );

  const adminCompanies = await recorder.step(
    'privacy-admin-companies',
    'Loading admin companies',
    async () => {
      const result = await client.request('/api/companies');
      assertOk(result, 'privacy admin companies');
      return parseBody(
        companiesResponseSchema,
        result.body,
        'privacy admin companies'
      );
    }
  );
  const adminCompany = adminCompanies[0];
  if (!adminCompany?.id) {
    throw new Error('No company available for privacy admin smoke test');
  }

  const adminProjects = await recorder.step(
    'privacy-admin-projects',
    `Loading admin projects for company ${companyLabel(adminCompany)}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(adminCompany.id)}/projects`
      );
      assertOk(result, 'privacy admin projects');
      return parseBody(
        projectsResponseSchema,
        result.body,
        'privacy admin projects'
      );
    }
  );
  const adminProject =
    adminProjects.find((candidate) => candidate.status === 'active') ??
    adminProjects[0];
  if (!adminProject?.id) {
    throw new Error('No project available for privacy admin smoke test');
  }
  const originalAccess = Boolean(adminProject.allowSuperadminAccess);

  try {
    await recorder.step(
      'privacy-enable-access',
      `Enabling superadmin access for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: true }),
            }
          ),
          'privacy enable superadmin access'
        );
      }
    );
    await recorder.step(
      'privacy-disable-access',
      `Disabling superadmin access for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: false }),
            }
          ),
          'privacy disable superadmin access'
        );
      }
    );
    await recorder.step(
      'privacy-admin-page',
      'Confirming admin can still view the project page',
      async () => {
        assertHtmlOk(
          await client.requestHtml(
            `/c/${encodeURIComponent(adminCompany.id)}/p/${encodeURIComponent(adminProject.id)}`
          ),
          'privacy admin project page after disable'
        );
      }
    );

    await client.request('/api/session', { method: 'DELETE' });
    await sleep(1000);

    await recorder.step(
      'privacy-superadmin-login',
      `Logging in as superadmin ${userLabel(privacySuperadminEmail, 'superadmin')}`,
      async () => {
        await client.loginWithEmailPassword(
          privacySuperadminEmail,
          privacySuperadminPassword,
          'privacy superadmin login'
        );
      }
    );

    const superProjects = await recorder.step(
      'privacy-superadmin-list',
      'Checking restricted project is hidden from superadmin project list',
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(adminCompany.id)}/projects`
        );
        assertOk(result, 'privacy superadmin projects');
        return parseBody(
          projectsResponseSchema,
          result.body,
          'privacy superadmin projects'
        );
      }
    );
    if (superProjects.some((project) => project.id === adminProject.id)) {
      throw new Error('Restricted project was still visible to superadmin');
    }

    const superProject = await recorder.step(
      'privacy-superadmin-fetch',
      'Checking restricted project cannot be fetched by superadmin',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(adminProject.id)}`
        );
        assertOk(result, 'privacy superadmin project fetch');
        return parseBody(
          projectResponseSchema.nullable(),
          result.body,
          'privacy superadmin project fetch'
        );
      }
    );
    if (superProject !== null) {
      throw new Error('Restricted project still resolved for superadmin');
    }
  } finally {
    await client.request('/api/session', { method: 'DELETE' });
    await sleep(1000);
    await recorder.step(
      'privacy-admin-relogin',
      `Relogging in as admin ${userLabel(privacyAdminEmail, 'admin')}`,
      async () => {
        await client.loginWithEmailPassword(
          privacyAdminEmail,
          privacyAdminPassword,
          'privacy admin relogin'
        );
      }
    );
    await recorder.step(
      'privacy-restore',
      `Restoring original superadmin access (${String(originalAccess)}) for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: originalAccess }),
            }
          ),
          'privacy restore superadmin access'
        );
      }
    );
  }
}

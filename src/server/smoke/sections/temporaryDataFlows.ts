import {
  companySummaryResponseSchema,
  projectResponseSchema,
} from '../../../validation/responseSchemas.ts';
import {
  assertOk,
  authenticatePrimaryUser,
  loadPrimaryCompanyAndProject,
  parseBody,
  selectInitialProjectOwnerUserId,
  uniqueId,
  type Recorder,
  type SmokeHttpClient,
} from '../shared.ts';

async function runProgrammesTemporaryDataSteps(
  recorder: Recorder,
  client: SmokeHttpClient,
  companyId: string,
  initialOwnerUserId: string
) {
  const programmeId = uniqueId('prg_smoke');
  const childProjectId = uniqueId('prj_programme_smoke');
  const categoryId = uniqueId('cat_programme_smoke');
  const subCategoryId = uniqueId('sub_programme_smoke');
  const txnId = uniqueId('txn_programme_smoke');
  const programmeName = uniqueId('Smoke Programme');
  const childProjectName = uniqueId('Smoke Programme Child');

  let programmeCreated = false;
  let childCreated = false;

  try {
    await recorder.step(
      'create-programme',
      `Creating temporary programme ${programmeName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/projects`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: programmeId,
              name: programmeName,
              projectType: 'programme',
              currency: 'AUD',
              initialOwnerUserId,
            }),
          }
        );
        assertOk(result, 'create programme');
        const programme = parseBody(
          projectResponseSchema,
          result.body,
          'create programme'
        );
        if (programme.projectType !== 'programme') {
          throw new Error('Created programme was not marked as programme.');
        }
        programmeCreated = true;
      }
    );

    await recorder.step(
      'create-programme-child',
      `Creating temporary sub-project ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/projects`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: childProjectId,
              name: childProjectName,
              projectType: 'project',
              parentProjectId: programmeId,
              currency: 'AUD',
              initialOwnerUserId,
            }),
          }
        );
        assertOk(result, 'create programme child project');
        const child = parseBody(
          projectResponseSchema,
          result.body,
          'create programme child project'
        );
        if (child.parentProjectId !== programmeId) {
          throw new Error('Sub-project did not link to programme.');
        }
        childCreated = true;
      }
    );

    await recorder.step(
      'programme-child-budget-total',
      `Setting total budget on ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ budgetTotalCents: 50000 }),
          }
        );
        assertOk(result, 'set programme child budget total');
      }
    );

    await recorder.step(
      'programme-child-taxonomy',
      `Creating taxonomy for ${childProjectName}`,
      async () => {
        const categoryResult = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: categoryId,
              companyId,
              projectId: childProjectId,
              name: uniqueId('Programme Smoke Category'),
            }),
          }
        );
        assertOk(categoryResult, 'create programme child category');

        const subCategoryResult = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: subCategoryId,
              companyId,
              projectId: childProjectId,
              categoryId,
              name: uniqueId('Programme Smoke Subcategory'),
            }),
          }
        );
        assertOk(subCategoryResult, 'create programme child subcategory');
      }
    );

    await recorder.step(
      'programme-child-transaction',
      `Creating coded transaction for ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/transactions`,
          {
            method: 'POST',
            body: JSON.stringify({
              txn: {
                id: txnId,
                companyId,
                projectId: childProjectId,
                date: '2026-05-06',
                item: 'Programme smoke transaction',
                description: 'Programme rollup verification',
                amountCents: 12500,
                categoryId,
                subCategoryId,
                codingSource: 'manual',
              },
            }),
          }
        );
        assertOk(result, 'create programme child transaction');
      }
    );

    await recorder.step(
      'programme-summary-rollup',
      `Checking programme rollup for ${programmeName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/summary`
        );
        assertOk(result, 'programme company summary');
        const summary = parseBody(
          companySummaryResponseSchema,
          result.body,
          'programme company summary'
        );
        const programme = summary.projects.find(
          (project) => project.id === programmeId
        );
        if (!programme) throw new Error('Programme was missing from summary.');
        if (programme.budgetCents !== 50000) {
          throw new Error('Programme did not roll up child project budget.');
        }
        if (programme.children?.[0]?.id !== childProjectId) {
          throw new Error('Programme did not include child project row.');
        }
        if (programme.months[0]?.actualCodedCents !== 12500) {
          throw new Error('Programme did not roll up child coded actuals.');
        }
      }
    );

    await recorder.step(
      'programme-operational-guard',
      `Checking programme ${programmeName} rejects operational endpoints`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(programmeId)}/budgets`
        );
        if (result.res.status !== 422) {
          throw new Error(
            `Expected programme budget endpoint to reject with 422, got ${result.res.status}.`
          );
        }
      }
    );
  } finally {
    if (childCreated) {
      await client.request(
        `/api/projects/${encodeURIComponent(childProjectId)}/deactivate`,
        { method: 'POST' }
      );
      await client.request(
        `/api/projects/${encodeURIComponent(childProjectId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: `DELETE ${childProjectName}` }),
        }
      );
    }
    if (programmeCreated) {
      await client.request(
        `/api/projects/${encodeURIComponent(programmeId)}/deactivate`,
        { method: 'POST' }
      );
      await client.request(`/api/projects/${encodeURIComponent(programmeId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: `DELETE ${programmeName}` }),
      });
    }
  }
}

export async function runTemporaryDataSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );
  const initialOwnerUserId = await selectInitialProjectOwnerUserId(
    recorder,
    client,
    company.id
  );
  const categoryId = uniqueId('cat_smoke');
  const budgetId = uniqueId('bud_smoke');
  const categoryName = uniqueId('Smoke Category');
  const budgetName = uniqueId('Smoke Budget');

  await recorder.step(
    'create-category',
    `Creating temporary category ${categoryName}`,
    async () => {
      const createdCategory = await client.request(
        `/api/projects/${encodeURIComponent(project.id)}/categories`,
        {
          method: 'POST',
          body: JSON.stringify({
            id: categoryId,
            companyId: company.id,
            projectId: project.id,
            name: categoryName,
          }),
        }
      );
      assertOk(createdCategory, 'create category');
    }
  );

  try {
    await recorder.step(
      'create-budget',
      `Creating temporary budget ${budgetName}`,
      async () => {
        const createdBudget = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: budgetId,
              companyId: company.id,
              projectId: project.id,
              categoryId,
              name: budgetName,
              allocatedCents: 1234,
            }),
          }
        );
        assertOk(createdBudget, 'create budget');
      }
    );
  } catch (error) {
    await client.request(
      `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
      { method: 'DELETE' }
    );
    throw error;
  }

  await recorder.step(
    'delete-budget',
    `Deleting temporary budget ${budgetName}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
          { method: 'DELETE' }
        ),
        'delete budget'
      );
    }
  );
  await recorder.step(
    'delete-category',
    `Deleting temporary category ${categoryName}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
          { method: 'DELETE' }
        ),
        'delete category'
      );
    }
  );

  await runProgrammesTemporaryDataSteps(
    recorder,
    client,
    company.id,
    initialOwnerUserId
  );
}

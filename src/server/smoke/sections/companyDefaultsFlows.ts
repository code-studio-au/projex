import {
  applyCompanyStandardsResultResponseSchema,
  budgetLinesResponseSchema,
  categoriesResponseSchema,
  subCategoriesResponseSchema,
  txnUpdateResultResponseSchema,
  txnsResponseSchema,
} from '../../../validation/responseSchemas.ts';
import {
  assertOk,
  authenticatePrimaryUser,
  loadPrimaryCompanyAndProject,
  parseBody,
  uniqueId,
  type Recorder,
  type SmokeHttpClient,
} from '../shared.ts';

export async function runCompanyDefaultsSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );
  const defaultCategoryId = uniqueId('ccat_smoke');
  const preferredDefaultSubCategoryId = uniqueId('csub_smoke_preferred');
  const fallbackDefaultSubCategoryId = uniqueId('csub_smoke_fallback');
  const preferredMappingRuleId = uniqueId('cmap_smoke_preferred');
  const fallbackMappingRuleId = uniqueId('cmap_smoke_fallback');
  const categoryName = uniqueId('Smoke Transport');
  const preferredSubCategoryName = uniqueId('Smoke Flights Preferred');
  const fallbackSubCategoryName = uniqueId('Smoke Flights Fallback');
  const preferredMatchText = uniqueId('smoke flight match');
  const fallbackMatchText = preferredMatchText
    .split(' ')
    .slice(0, -1)
    .join(' ');
  const txnId = uniqueId('txn_smoke_defaults');
  const txnExternalId = uniqueId('external_smoke_defaults');

  let projectCategoryId: string | null = null;
  let projectPreferredSubCategoryId: string | null = null;
  let importedTxnId: string | null = null;
  let budgetId: string | null = null;
  let createdDefaultCategory = false;
  let createdPreferredDefaultSubCategory = false;
  let createdFallbackDefaultSubCategory = false;
  let createdPreferredDefaultMapping = false;
  let createdFallbackDefaultMapping = false;

  try {
    await recorder.step(
      'create-default-category',
      `Creating company default category ${categoryName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: defaultCategoryId,
              companyId: company.id,
              name: categoryName,
            }),
          }
        );
        assertOk(result, 'create company default category');
        createdDefaultCategory = true;
      }
    );

    await recorder.step(
      'create-default-subcategory',
      `Creating company default subcategories ${preferredSubCategoryName} and ${fallbackSubCategoryName}`,
      async () => {
        const preferredResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: preferredDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: preferredSubCategoryName,
            }),
          }
        );
        assertOk(
          preferredResult,
          'create preferred company default subcategory'
        );
        createdPreferredDefaultSubCategory = true;

        const fallbackResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: fallbackDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: fallbackSubCategoryName,
            }),
          }
        );
        assertOk(fallbackResult, 'create fallback company default subcategory');
        createdFallbackDefaultSubCategory = true;
      }
    );

    await recorder.step(
      'create-default-mapping',
      `Creating overlapping company default mapping rules for ${preferredMatchText}`,
      async () => {
        const preferredResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: preferredMappingRuleId,
              companyId: company.id,
              matchText: preferredMatchText,
              companyDefaultCategoryId: defaultCategoryId,
              companyDefaultSubCategoryId: preferredDefaultSubCategoryId,
              sortOrder: 999998,
            }),
          }
        );
        assertOk(
          preferredResult,
          'create preferred company default mapping rule'
        );
        createdPreferredDefaultMapping = true;

        const fallbackResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: fallbackMappingRuleId,
              companyId: company.id,
              matchText: fallbackMatchText,
              companyDefaultCategoryId: defaultCategoryId,
              companyDefaultSubCategoryId: fallbackDefaultSubCategoryId,
              sortOrder: 999999,
            }),
          }
        );
        assertOk(
          fallbackResult,
          'create fallback company default mapping rule'
        );
        createdFallbackDefaultMapping = true;
      }
    );

    await recorder.step(
      'apply-company-standards',
      'Applying company standards to the project',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/apply-company-standards`,
          { method: 'POST' }
        );
        assertOk(result, 'apply company standards');
        const body = parseBody(
          applyCompanyStandardsResultResponseSchema,
          result.body,
          'apply company standards'
        );
        if (!body.companyDefaultsConfigured) {
          throw new Error(
            'Company defaults were not reported as configured during apply.'
          );
        }
      }
    );

    await recorder.step(
      'import-mapped-transaction',
      `Importing a matching uncoded transaction for ${preferredMatchText}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions/import`,
          {
            method: 'POST',
            body: JSON.stringify({
              mode: 'append',
              autoCreateBudgets: true,
              txns: [
                {
                  id: txnId,
                  externalId: txnExternalId,
                  companyId: company.id,
                  projectId: project.id,
                  date: '2024-01-09',
                  item: 'Smoke Imported Flight',
                  description: `Auto-map ${preferredMatchText}`,
                  amountCents: 24560,
                },
              ],
            }),
          }
        );
        assertOk(result, 'import auto-mapped transaction');
      }
    );

    await recorder.step(
      'verify-auto-mapped',
      'Verifying the imported transaction was auto-mapped',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        );
        assertOk(result, 'list imported transactions');
        const txns = parseBody(
          txnsResponseSchema,
          result.body,
          'list imported transactions'
        );
        const imported = txns.find(
          (txn) => txn.id === txnId || txn.externalId === txnExternalId
        );
        if (!imported) {
          throw new Error('Imported smoke transaction was not found.');
        }
        if (!imported.categoryId || !imported.subCategoryId) {
          throw new Error(
            'Imported smoke transaction was not coded by company defaults.'
          );
        }
        if (!imported.codingPendingApproval) {
          throw new Error(
            'Imported smoke transaction was not marked pending approval.'
          );
        }
        importedTxnId = String(imported.id);

        const categoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/categories`
        );
        assertOk(categoriesResult, 'list project categories after apply');
        const projectCategories = parseBody(
          categoriesResponseSchema,
          categoriesResult.body,
          'list project categories after apply'
        );
        projectCategoryId =
          projectCategories.find((category) => category.name === categoryName)
            ?.id ?? null;
        if (!projectCategoryId) {
          throw new Error(
            `Applied project category ${categoryName} was not found.`
          );
        }

        const subCategoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories after apply');
        const projectSubCategories = parseBody(
          subCategoriesResponseSchema,
          subCategoriesResult.body,
          'list project subcategories after apply'
        );
        projectPreferredSubCategoryId =
          projectSubCategories.find(
            (subCategory) =>
              subCategory.name === preferredSubCategoryName &&
              subCategory.categoryId === projectCategoryId
          )?.id ?? null;
        if (!projectPreferredSubCategoryId) {
          throw new Error(
            `Applied project subcategory ${preferredSubCategoryName} was not found.`
          );
        }
      }
    );

    await recorder.step(
      'verify-rule-ordering',
      'Verifying the higher-priority mapping rule won',
      async () => {
        if (!importedTxnId) {
          throw new Error(
            'No imported transaction id available for rule-ordering verification.'
          );
        }
        if (!projectPreferredSubCategoryId) {
          throw new Error(
            'No preferred project subcategory id available for rule-ordering verification.'
          );
        }
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        );
        assertOk(
          result,
          'list imported transactions for rule-ordering verification'
        );
        const txns = parseBody(
          txnsResponseSchema,
          result.body,
          'list imported transactions for rule-ordering verification'
        );
        const imported = txns.find((txn) => String(txn.id) === importedTxnId);
        if (!imported) {
          throw new Error(
            'Imported smoke transaction was not found for rule-ordering verification.'
          );
        }
        if (
          String(imported.subCategoryId ?? '') !== projectPreferredSubCategoryId
        ) {
          throw new Error(
            `Expected higher-priority mapping to target ${preferredSubCategoryName}, but it mapped elsewhere.`
          );
        }
      }
    );

    await recorder.step(
      'approve-auto-mapped',
      'Approving the auto-mapped transaction',
      async () => {
        if (!importedTxnId) {
          throw new Error('No imported transaction id available for approval.');
        }
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              txn: {
                id: importedTxnId,
                codingPendingApproval: false,
              },
            }),
          }
        );
        assertOk(result, 'approve auto-mapped transaction');
        const approvedResult = parseBody(
          txnUpdateResultResponseSchema,
          result.body,
          'approve auto-mapped transaction'
        );
        const approved = approvedResult.txn;
        if (!approved.categoryId || !approved.subCategoryId) {
          throw new Error('Approved transaction lost its coding.');
        }
        if (approved.codingPendingApproval) {
          throw new Error('Approved transaction still shows pending approval.');
        }
      }
    );

    await recorder.step(
      'verify-budget-line',
      `Verifying budget line exists for ${preferredSubCategoryName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets`
        );
        assertOk(result, 'list project budgets');
        const budgets = parseBody(
          budgetLinesResponseSchema,
          result.body,
          'list project budgets'
        );
        const subCategoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories');
        const projectSubCategories = parseBody(
          subCategoriesResponseSchema,
          subCategoriesResult.body,
          'list project subcategories'
        );
        const projectSubCategory = projectSubCategories.find(
          (subCategory) =>
            subCategory.name === preferredSubCategoryName &&
            subCategory.categoryId === projectCategoryId
        );
        if (!projectSubCategory) {
          throw new Error(
            `Applied project subcategory ${preferredSubCategoryName} was not found.`
          );
        }
        const matchingBudget = budgets.find(
          (entry) =>
            entry.subCategoryId === projectSubCategory.id &&
            entry.categoryId === projectCategoryId
        );
        if (!matchingBudget) {
          throw new Error(
            `No budget line existed for ${preferredSubCategoryName} after import.`
          );
        }
        budgetId = String(matchingBudget.id);
      }
    );
  } finally {
    await recorder.step(
      'cleanup-imported-transaction',
      'Deleting the imported transaction',
      async () => {
        if (!importedTxnId) return;
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions/${encodeURIComponent(importedTxnId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete imported smoke transaction');
      }
    );
    await recorder.step(
      'cleanup-budget-line',
      'Deleting the temporary budget line',
      async () => {
        if (!budgetId) return;
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary smoke budget');
      }
    );
    await recorder.step(
      'cleanup-project-category',
      'Deleting the temporary project category',
      async () => {
        if (!projectCategoryId) return;
        // After company standards are applied this category is inherited from the
        // company defaults, so project-level deletion is no longer valid.
        projectCategoryId = null;
      }
    );
    await recorder.step(
      'cleanup-default-mapping',
      'Deleting the temporary company default mapping rule',
      async () => {
        if (createdPreferredDefaultMapping) {
          const preferredResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(preferredMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            preferredResult,
            'delete preferred temporary company default mapping rule'
          );
        }
        if (createdFallbackDefaultMapping) {
          const fallbackResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(fallbackMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            fallbackResult,
            'delete fallback temporary company default mapping rule'
          );
        }
      }
    );
    await recorder.step(
      'cleanup-default-subcategory',
      'Deleting the temporary company default subcategory',
      async () => {
        if (createdPreferredDefaultSubCategory) {
          const preferredResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(preferredDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            preferredResult,
            'delete preferred temporary company default subcategory'
          );
        }
        if (createdFallbackDefaultSubCategory) {
          const fallbackResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(fallbackDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            fallbackResult,
            'delete fallback temporary company default subcategory'
          );
        }
      }
    );
    await recorder.step(
      'cleanup-default-category',
      'Deleting the temporary company default category',
      async () => {
        if (!createdDefaultCategory) return;
        const result = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-categories/${encodeURIComponent(defaultCategoryId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary company default category');
      }
    );
  }
}

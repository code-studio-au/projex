import { projectRoute } from '../router';
import { Route as projectWorkspaceRoute } from '../routes/_authed.c.$companyId.p.$projectId';

import ProjectWorkspace from '../components/ProjectWorkspace';
import type { CompanyId, ProjectId } from '../types';
import {
  asCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../types';

export default function ProjectWorkspacePage() {
  // Route params are required by the route definition (c/$companyId/p/$projectId).
  // Using the route object's hook keeps types aligned with TanStack Router.
  const { companyId: rawCompanyId, projectId: rawProjectId } =
    projectRoute.useParams();
  const search = projectRoute.useSearch();
  const loaderData = projectWorkspaceRoute.useLoaderData();

  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const projectId: ProjectId = asProjectId(rawProjectId);

  return (
    <ProjectWorkspace
      companyId={companyId}
      projectId={projectId}
      initialCompanyName={loaderData?.companyName ?? null}
      initialProjectName={loaderData?.projectName ?? null}
      initialProjectType={loaderData?.projectType ?? 'project'}
      initialCurrencyCode={loaderData?.currencyCode ?? 'AUD'}
      initialAllowSuperadminAccess={loaderData?.allowSuperadminAccess ?? false}
      initialAllowTxnTransfers={loaderData?.allowTxnTransfers ?? false}
      initialProjectBudgetTotalCents={loaderData?.projectBudgetTotalCents ?? 0}
      initialProgrammeSummary={loaderData?.initialProgrammeSummary ?? null}
      initialCanViewProgrammeSummary={
        loaderData?.canViewProgrammeSummary ?? false
      }
      initialCanImport={loaderData?.canImport ?? false}
      initialCanEditBudgets={loaderData?.canEditBudgets ?? false}
      initialCanEditTxns={loaderData?.canEditTxns ?? false}
      initialCanEditTaxonomy={loaderData?.canEditTaxonomy ?? false}
      initialCanProjectEdit={loaderData?.canProjectEdit ?? false}
      initialTab={
        search.tab ?? (search.commentTxn ? 'transactions' : undefined)
      }
      initialYearFilter={search.year ?? null}
      initialQuarterFilter={search.quarter ?? null}
      initialMonthFilterKey={search.month ?? null}
      initialTransactionView={search.view}
      initialCommentTxnId={
        search.commentTxn ? asTxnId(search.commentTxn) : null
      }
      initialTransactionDrilldown={
        search.drilldownKind === 'subcategory' &&
        search.categoryId &&
        search.subCategoryId
          ? {
              kind: 'subcategory',
              categoryId: asCategoryId(search.categoryId),
              subCategoryId: asSubCategoryId(search.subCategoryId),
              categoryName: search.categoryName,
              subCategoryName: search.subCategoryName,
            }
          : search.drilldownKind === 'category' && search.categoryId
            ? {
                kind: 'category',
                categoryId: asCategoryId(search.categoryId),
                categoryName: search.categoryName,
              }
            : null
      }
      initialEntrySource={search.source}
      initialEntryFocus={search.focus}
    />
  );
}

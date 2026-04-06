import { projectRoute } from '../router';

import ProjectWorkspace from '../components/ProjectWorkspace';
import type { CompanyId, ProjectId } from '../types';
import { asCompanyId, asProjectId } from '../types';

export default function ProjectWorkspacePage() {
  // Route params are required by the route definition (c/$companyId/p/$projectId).
  // Using the route object's hook keeps types aligned with TanStack Router.
  const { companyId: rawCompanyId, projectId: rawProjectId } = projectRoute.useParams();
  const search = projectRoute.useSearch();

  const companyId: CompanyId = asCompanyId(rawCompanyId);
  const projectId: ProjectId = asProjectId(rawProjectId);

  return (
    <ProjectWorkspace
      companyId={companyId}
      projectId={projectId}
      initialTab={search.tab}
      initialYearFilter={search.year ?? null}
      initialQuarterFilter={search.quarter ?? null}
      initialMonthFilterKey={search.month ?? null}
      initialTransactionView={search.view}
      initialEntrySource={search.source}
      initialEntryFocus={search.focus}
    />
  );
}

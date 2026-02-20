import { Stack, Text } from '@mantine/core';
import { projectRoute } from '../router';

import ProjectWorkspace from '../components/ProjectWorkspace';
import type { CompanyId, ProjectId } from '../types';
import { asCompanyId, asProjectId } from '../types';

export default function ProjectWorkspacePage() {
  // Use the route object's hook to avoid `from` mismatches across router versions.
  const { companyId: rawCompanyId, projectId: rawProjectId } = projectRoute.useParams() as {
    companyId?: string;
    projectId?: string;
  };

  const companyId = asCompanyId(rawCompanyId) as CompanyId;
  const projectId = asProjectId(rawProjectId) as ProjectId;

  if (!companyId || !projectId) {
    return (
      <Stack>
        <Text c="dimmed">Missing route params.</Text>
      </Stack>
    );
  }

  return <ProjectWorkspace companyId={companyId} projectId={projectId} />;
}

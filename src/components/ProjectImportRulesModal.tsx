import type { CompanyId, ProjectId } from '../types';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import {
  useCreateProjectImportRuleMutation,
  useDeleteProjectImportRuleMutation,
  useProjectImportRulesQuery,
  usePromoteProjectImportRuleMutation,
  useUpdateProjectImportRuleMutation,
} from '../queries/importRules';
import ImportRulesEditorModal from './ImportRulesEditorModal';

export default function ProjectImportRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  projectId: ProjectId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, projectId, readOnly = false } = props;
  const access = useCompanyAccess(companyId);
  const rules = useProjectImportRulesQuery(projectId);
  const createRule = useCreateProjectImportRuleMutation(companyId, projectId);
  const updateRule = useUpdateProjectImportRuleMutation(companyId, projectId);
  const deleteRule = useDeleteProjectImportRuleMutation(companyId, projectId);
  const promoteRule = usePromoteProjectImportRuleMutation(companyId, projectId);

  return (
    <ImportRulesEditorModal
      opened={opened}
      onClose={onClose}
      readOnly={readOnly}
      adapter={{
        scope: 'project',
        rules: rules.data ?? [],
        loading: rules.isPending,
        creating: createRule.isPending,
        updating: updateRule.isPending,
        deleting: deleteRule.isPending,
        promoting: promoteRule.isPending,
        canPromote: access.can('company:manage_defaults'),
        create: (draft) =>
          createRule.mutateAsync({
            companyId,
            projectId,
            scope: 'project',
            ...draft,
          }),
        update: (draft) => updateRule.mutateAsync(draft),
        delete: (ruleId) => deleteRule.mutateAsync(ruleId),
        promote: (ruleId) => promoteRule.mutateAsync(ruleId),
      }}
    />
  );
}

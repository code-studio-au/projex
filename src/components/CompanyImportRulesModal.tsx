import type { CompanyId } from '../types';
import {
  useCreateImportRuleMutation,
  useDeleteImportRuleMutation,
  useImportRulesQuery,
  useUpdateImportRuleMutation,
} from '../queries/importRules';
import ImportRulesEditorModal from './ImportRulesEditorModal';

export default function CompanyImportRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const rules = useImportRulesQuery(companyId);
  const createRule = useCreateImportRuleMutation(companyId);
  const updateRule = useUpdateImportRuleMutation(companyId);
  const deleteRule = useDeleteImportRuleMutation(companyId);

  return (
    <ImportRulesEditorModal
      opened={opened}
      onClose={onClose}
      readOnly={readOnly}
      adapter={{
        scope: 'company',
        rules: rules.data ?? [],
        loading: rules.isPending,
        creating: createRule.isPending,
        updating: updateRule.isPending,
        deleting: deleteRule.isPending,
        create: (draft) =>
          createRule.mutateAsync({
            companyId,
            scope: 'company',
            ...draft,
          }),
        update: (draft) => updateRule.mutateAsync(draft),
        delete: (ruleId) => deleteRule.mutateAsync(ruleId),
      }}
    />
  );
}

import { useMemo } from 'react';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import {
  useBackfillProjectCodingMutation,
  useCreateProjectAutoCodingRuleMutation,
  useDeleteProjectAutoCodingRuleMutation,
  useProjectAutoCodingRulesQuery,
  usePromoteProjectRuleToCompanyDefaultMutation,
  useUpdateProjectAutoCodingRuleMutation,
} from '../queries/projectAutoCodingRules';
import { useCategoriesQuery, useSubCategoriesQuery } from '../queries/taxonomy';
import type { CompanyId, ProjectId } from '../types';
import { asProjectAutoCodingRuleId, asSubCategoryId } from '../types';
import AutoCodingRulesEditorModal from './AutoCodingRulesEditorModal';

export default function ProjectAutoCodingRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  projectId: ProjectId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, projectId, readOnly = false } = props;
  const access = useCompanyAccess(companyId);
  const categoriesQ = useCategoriesQuery(projectId);
  const subCategoriesQ = useSubCategoriesQuery(projectId);
  const rulesQ = useProjectAutoCodingRulesQuery(projectId);
  const createRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const updateRule = useUpdateProjectAutoCodingRuleMutation(projectId);
  const deleteRule = useDeleteProjectAutoCodingRuleMutation(projectId);
  const backfill = useBackfillProjectCodingMutation(projectId);
  const promoteRule = usePromoteProjectRuleToCompanyDefaultMutation(projectId);

  const categories = useMemo(
    () =>
      (categoriesQ.data ?? []).map((category) => ({
        id: category.id,
        name: category.name,
      })),
    [categoriesQ.data]
  );
  const subCategories = useMemo(
    () =>
      (subCategoriesQ.data ?? []).map((subCategory) => ({
        id: subCategory.id,
        categoryId: subCategory.categoryId,
        name: subCategory.name,
      })),
    [subCategoriesQ.data]
  );
  const rules = useMemo(
    () =>
      (rulesQ.data ?? []).map((rule) => ({
        id: rule.id,
        matchText: rule.matchText,
        categoryId: rule.categoryId,
        subCategoryId: rule.subCategoryId,
        sortOrder: rule.sortOrder,
        originScope: rule.originScope,
        syncStatus: rule.syncStatus,
      })),
    [rulesQ.data]
  );

  return (
    <AutoCodingRulesEditorModal
      opened={opened}
      onClose={onClose}
      readOnly={readOnly}
      adapter={{
        scope: 'project',
        rules,
        categories,
        subCategories,
        loading:
          categoriesQ.isPending || subCategoriesQ.isPending || rulesQ.isPending,
        creating: createRule.isPending,
        updating: updateRule.isPending,
        deleting: deleteRule.isPending,
        promoting: promoteRule.isPending,
        backfilling: backfill.isPending,
        canPromote: access.can('company:manage_defaults'),
        create: ({ matchText, subCategoryId }) =>
          createRule.mutateAsync({
            matchText,
            subCategoryId: asSubCategoryId(subCategoryId),
          }),
        update: ({ id, matchText, subCategoryId, sortOrder }) =>
          updateRule.mutateAsync({
            id: asProjectAutoCodingRuleId(id),
            ...(typeof matchText === 'string' ? { matchText } : {}),
            ...(typeof subCategoryId === 'string'
              ? { subCategoryId: asSubCategoryId(subCategoryId) }
              : {}),
            ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
          }),
        delete: (ruleId) =>
          deleteRule.mutateAsync(asProjectAutoCodingRuleId(ruleId)),
        promote: async (ruleId) => {
          const result = await promoteRule.mutateAsync({
            ruleId: asProjectAutoCodingRuleId(ruleId),
          });
          return result.ruleCreated
            ? 'Added project rule to company defaults.'
            : 'The matching company rule already existed; the project rule is now aligned.';
        },
        backfill: async () => {
          const result = await backfill.mutateAsync({ mode: 'all' });
          return result.updatedCount === 0
            ? 'No uncoded transactions matched current company or project rules.'
            : `Coded ${result.updatedCount} uncoded transactions (${result.projectRuleMatches} project-rule and ${result.companyRuleMatches} company-rule matches).`;
        },
      }}
    />
  );
}

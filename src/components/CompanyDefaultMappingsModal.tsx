import { useMemo } from 'react';

import {
  useCompanyDefaultsQuery,
  useCreateCompanyDefaultMappingRuleMutation,
  useDeleteCompanyDefaultMappingRuleMutation,
  useUpdateCompanyDefaultMappingRuleMutation,
} from '../queries/taxonomy';
import type { CompanyId } from '../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
} from '../types';
import AutoCodingRulesEditorModal from './AutoCodingRulesEditorModal';

export default function CompanyDefaultMappingsModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const createRule = useCreateCompanyDefaultMappingRuleMutation(companyId);
  const updateRule = useUpdateCompanyDefaultMappingRuleMutation(companyId);
  const deleteRule = useDeleteCompanyDefaultMappingRuleMutation(companyId);

  const categories = useMemo(
    () =>
      (companyDefaultsQ.data?.categories ?? []).map((category) => ({
        id: category.id,
        name: category.name,
      })),
    [companyDefaultsQ.data?.categories]
  );
  const subCategories = useMemo(
    () =>
      (companyDefaultsQ.data?.subCategories ?? []).map((subCategory) => ({
        id: subCategory.id,
        categoryId: subCategory.companyDefaultCategoryId,
        name: subCategory.name,
      })),
    [companyDefaultsQ.data?.subCategories]
  );
  const rules = useMemo(
    () =>
      (companyDefaultsQ.data?.mappingRules ?? []).map((rule) => ({
        id: rule.id,
        matchText: rule.matchText,
        categoryId: rule.companyDefaultCategoryId,
        subCategoryId: rule.companyDefaultSubCategoryId,
        sortOrder: rule.sortOrder,
      })),
    [companyDefaultsQ.data?.mappingRules]
  );

  return (
    <AutoCodingRulesEditorModal
      opened={opened}
      onClose={onClose}
      readOnly={readOnly}
      adapter={{
        scope: 'company',
        rules,
        categories,
        subCategories,
        loading: companyDefaultsQ.isPending,
        creating: createRule.isPending,
        updating: updateRule.isPending,
        deleting: deleteRule.isPending,
        create: ({ matchText, categoryId, subCategoryId, sortOrder }) =>
          createRule.mutateAsync({
            companyId,
            matchText,
            companyDefaultCategoryId: asCompanyDefaultCategoryId(categoryId),
            companyDefaultSubCategoryId:
              asCompanyDefaultSubCategoryId(subCategoryId),
            sortOrder,
          }),
        update: ({ id, matchText, categoryId, subCategoryId, sortOrder }) =>
          updateRule.mutateAsync({
            id: asCompanyDefaultMappingRuleId(id),
            ...(typeof matchText === 'string' ? { matchText } : {}),
            ...(typeof categoryId === 'string'
              ? {
                  companyDefaultCategoryId:
                    asCompanyDefaultCategoryId(categoryId),
                }
              : {}),
            ...(typeof subCategoryId === 'string'
              ? {
                  companyDefaultSubCategoryId:
                    asCompanyDefaultSubCategoryId(subCategoryId),
                }
              : {}),
            ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
          }),
        delete: (ruleId) =>
          deleteRule.mutateAsync(asCompanyDefaultMappingRuleId(ruleId)),
      }}
    />
  );
}

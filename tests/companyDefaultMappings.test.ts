import assert from 'node:assert/strict';
import { test } from 'vitest';

import { resolveCompanyDefaultRuleToProjectTaxonomy } from '../src/utils/companyDefaultMappings.ts';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
} from '../src/types/index.ts';

test('company rules resolve moved project overrides by subcategory origin ID', () => {
  const companyId = asCompanyId('co_1');
  const projectId = asProjectId('prj_1');
  const defaultItId = asCompanyDefaultCategoryId('dcat_it');
  const defaultTravelId = asCompanyDefaultCategoryId('dcat_travel');
  const defaultEquipmentId = asCompanyDefaultSubCategoryId('dsub_equipment');
  const projectItId = asCategoryId('cat_it');
  const projectTravelId = asCategoryId('cat_travel');
  const inheritedEquipmentId = asSubCategoryId('sub_inherited_equipment');
  const localEquipmentId = asSubCategoryId('sub_local_equipment');

  const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
    rule: {
      id: asCompanyDefaultMappingRuleId('rule_1'),
      companyId,
      matchText: 'equipment',
      companyDefaultCategoryId: defaultItId,
      companyDefaultSubCategoryId: defaultEquipmentId,
      sortOrder: 0,
    },
    defaultCategories: [
      { id: defaultItId, companyId, name: 'IT' },
      { id: defaultTravelId, companyId, name: 'Travel' },
    ],
    defaultSubCategories: [
      {
        id: defaultEquipmentId,
        companyId,
        companyDefaultCategoryId: defaultItId,
        name: 'Equipment',
      },
    ],
    projectCategories: [
      { id: projectItId, companyId, projectId, name: 'IT' },
      { id: projectTravelId, companyId, projectId, name: 'Travel' },
    ],
    projectSubCategories: [
      {
        id: localEquipmentId,
        companyId,
        projectId,
        categoryId: projectItId,
        name: 'Equipment',
      },
      {
        id: inheritedEquipmentId,
        companyId,
        projectId,
        categoryId: projectTravelId,
        name: 'Equipment',
        originScope: 'company',
        originCompanyItemId: defaultEquipmentId,
        syncStatus: 'overridden',
      },
    ],
  });

  assert.deepEqual(resolved, {
    categoryId: projectTravelId,
    subCategoryId: inheritedEquipmentId,
  });
});

import { describe, expect, test } from 'vitest';

import {
  getTaxonomyDeleteAffectedSubCategoryIds,
  getTaxonomySubCategoryOptions,
  resolveTaxonomyDeleteRuleHandling,
} from '../src/components/taxonomyManager/taxonomyActionModel';

const subCategories = [
  { id: 'sub-1', categoryId: 'category-1', name: 'Flights' },
  { id: 'sub-2', categoryId: 'category-1', name: 'Hotels' },
  { id: 'sub-3', categoryId: 'category-2', name: 'Software' },
];

describe('taxonomy action model', () => {
  test('category deletion identifies every affected subcategory', () => {
    expect([
      ...getTaxonomyDeleteAffectedSubCategoryIds({
        target: {
          kind: 'category',
          id: 'category-1',
          name: 'Travel',
        },
        subCategories,
      }),
    ]).toEqual(['sub-1', 'sub-2']);
  });

  test('replacement options stay in the selected category and exclude affected items', () => {
    expect(
      getTaxonomySubCategoryOptions({
        subCategories,
        categoryId: 'category-1',
        excludedIds: new Set(['sub-1']),
      })
    ).toEqual([{ value: 'sub-2', label: 'Hotels' }]);
  });

  test('affected subcategory rules default to safe reassignment', () => {
    const target = {
      kind: 'subcategory' as const,
      id: 'sub-1',
      name: 'Flights',
    };

    expect(
      resolveTaxonomyDeleteRuleHandling({
        selected: null,
        target,
        affectedRuleCount: 2,
      })
    ).toBe('reassign');
    expect(
      resolveTaxonomyDeleteRuleHandling({
        selected: 'delete',
        target,
        affectedRuleCount: 2,
      })
    ).toBe('delete');
  });
});

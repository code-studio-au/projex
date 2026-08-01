import { describe, expect, test } from 'vitest';

import {
  compactProjectWorkspaceSearchForNavigation,
  normalizeProjectWorkspaceSearchForSync,
} from '../src/components/projectWorkspace/useProjectWorkspaceUrlSync';

describe('project workspace URL synchronization', () => {
  test('retains supported values and the transaction query', () => {
    expect(
      normalizeProjectWorkspaceSearchForSync({
        year: '2026',
        quarter: 'Q3',
        tab: 'transactions',
        month: '2026-07',
        view: 'needs-review',
        q: 'supplier',
        source: 'company-summary',
        focus: 'actual',
        drilldownKind: 'subcategory',
        categoryId: 'category-1',
        categoryName: 'Travel',
        subCategoryId: 'subcategory-1',
        subCategoryName: 'Flights',
      })
    ).toEqual({
      year: '2026',
      quarter: 'Q3',
      tab: 'transactions',
      month: '2026-07',
      view: 'needs-review',
      q: 'supplier',
      source: 'company-summary',
      focus: 'actual',
      drilldownKind: 'subcategory',
      categoryId: 'category-1',
      categoryName: 'Travel',
      subCategoryId: 'subcategory-1',
      subCategoryName: 'Flights',
    });
  });

  test('normalizes unsupported values without discarding independent fields', () => {
    const normalized = normalizeProjectWorkspaceSearchForSync({
      year: 2026,
      quarter: 'Q5',
      tab: 'admin',
      month: false,
      view: 1,
      q: 'supplier',
      source: 'email',
      focus: 'forecast',
      drilldownKind: 'project',
      categoryId: null,
      categoryName: 12,
      subCategoryId: [],
      subCategoryName: {},
    });

    expect(normalized).toEqual({
      year: undefined,
      quarter: undefined,
      tab: undefined,
      month: undefined,
      view: undefined,
      q: 'supplier',
      source: undefined,
      focus: undefined,
      drilldownKind: undefined,
      categoryId: undefined,
      categoryName: undefined,
      subCategoryId: undefined,
      subCategoryName: undefined,
    });
    expect(compactProjectWorkspaceSearchForNavigation(normalized)).toEqual({
      q: 'supplier',
    });
  });
});

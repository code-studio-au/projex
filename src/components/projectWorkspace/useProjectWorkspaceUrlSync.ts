import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';

import type {
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategoryId,
} from '../../types';
import type { TransactionView } from '../transactions/transactionViews';
import type { ProjectWorkspaceTab } from '../projectWorkspaceTabAccess';

export type ProjectWorkspaceEntrySource =
  'company-summary' | 'company-work-queue';
export type ProjectWorkspaceEntryFocus =
  'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';

export type TransactionDrilldownSearch =
  | {
      kind: 'category';
      categoryId: CategoryId;
      categoryName?: string;
    }
  | {
      kind: 'subcategory';
      categoryId: CategoryId;
      subCategoryId: SubCategoryId;
      categoryName?: string;
      subCategoryName?: string;
    };

export function normalizeProjectWorkspaceSearchForSync(
  search: Record<string, unknown>
) {
  return {
    year: typeof search.year === 'string' ? search.year : undefined,
    quarter:
      search.quarter === 'Q1' ||
      search.quarter === 'Q2' ||
      search.quarter === 'Q3' ||
      search.quarter === 'Q4'
        ? search.quarter
        : undefined,
    tab:
      search.tab === 'budget' ||
      search.tab === 'transactions' ||
      search.tab === 'import' ||
      search.tab === 'settings'
        ? search.tab
        : undefined,
    month: typeof search.month === 'string' ? search.month : undefined,
    view: typeof search.view === 'string' ? search.view : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    source:
      search.source === 'company-summary' ||
      search.source === 'company-work-queue'
        ? search.source
        : undefined,
    focus:
      search.focus === 'budget' ||
      search.focus === 'actual' ||
      search.focus === 'remaining' ||
      search.focus === 'uncoded' ||
      search.focus === 'health'
        ? search.focus
        : undefined,
    drilldownKind:
      search.drilldownKind === 'category' ||
      search.drilldownKind === 'subcategory'
        ? search.drilldownKind
        : undefined,
    categoryId:
      typeof search.categoryId === 'string' ? search.categoryId : undefined,
    categoryName:
      typeof search.categoryName === 'string' ? search.categoryName : undefined,
    subCategoryId:
      typeof search.subCategoryId === 'string'
        ? search.subCategoryId
        : undefined,
    subCategoryName:
      typeof search.subCategoryName === 'string'
        ? search.subCategoryName
        : undefined,
  };
}

export function useProjectWorkspaceUrlSync(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  activeTab: ProjectWorkspaceTab;
  yearFilter: string | null;
  quarterFilter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  monthFilterKey: string | null;
  transactionView: TransactionView;
  transactionDrilldown: TransactionDrilldownSearch | null;
  entrySource?: ProjectWorkspaceEntrySource;
  entryFocus?: ProjectWorkspaceEntryFocus;
}) {
  const {
    companyId,
    projectId,
    activeTab,
    yearFilter,
    quarterFilter,
    monthFilterKey,
    transactionView,
    transactionDrilldown,
    entrySource,
    entryFocus,
  } = args;
  const router = useRouter();
  const nextSyncShouldReplaceRef = useRef(true);

  useEffect(() => {
    const replace = nextSyncShouldReplaceRef.current;
    nextSyncShouldReplaceRef.current = true;
    const currentSearch = router.state.location.search as Record<
      string,
      unknown
    >;
    const nextSearch = {
      year: yearFilter ?? undefined,
      quarter: quarterFilter ?? undefined,
      tab: activeTab === 'budget' ? undefined : activeTab,
      month: monthFilterKey ?? undefined,
      view: transactionView === 'all' ? undefined : transactionView,
      q: typeof currentSearch.q === 'string' ? currentSearch.q : undefined,
      source: entrySource,
      focus: entryFocus,
      drilldownKind: transactionDrilldown?.kind,
      categoryId: transactionDrilldown?.categoryId,
      categoryName: transactionDrilldown?.categoryName,
      subCategoryId:
        transactionDrilldown?.kind === 'subcategory'
          ? transactionDrilldown.subCategoryId
          : undefined,
      subCategoryName:
        transactionDrilldown?.kind === 'subcategory'
          ? transactionDrilldown.subCategoryName
          : undefined,
    };
    if (
      JSON.stringify(normalizeProjectWorkspaceSearchForSync(currentSearch)) ===
      JSON.stringify(nextSearch)
    ) {
      return;
    }
    void router.navigate({
      to: '/c/$companyId/p/$projectId',
      params: { companyId, projectId },
      search: nextSearch,
      replace,
    });
  }, [
    activeTab,
    companyId,
    entryFocus,
    entrySource,
    monthFilterKey,
    projectId,
    quarterFilter,
    router,
    transactionDrilldown,
    transactionView,
    yearFilter,
  ]);

  return {
    pushNextUrlSync() {
      nextSyncShouldReplaceRef.current = false;
    },
  };
}

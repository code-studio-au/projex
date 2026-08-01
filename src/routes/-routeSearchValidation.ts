const PROJECT_WORKSPACE_TABS = [
  'budget',
  'transactions',
  'import',
  'settings',
] as const;
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const TRANSACTION_VIEWS = [
  'all',
  'uncoded',
  'needs-review',
  'auto-mapped-pending',
  'reversal-review',
  'unlock-requests',
  'assigned-to-me',
  'pending-reversal',
  'matched-reversal-pairs',
] as const;
const PROJECT_WORKSPACE_SOURCES = [
  'company-summary',
  'company-work-queue',
] as const;
const PROJECT_WORKSPACE_FOCUSES = [
  'budget',
  'actual',
  'remaining',
  'uncoded',
  'health',
] as const;
const DRILLDOWN_KINDS = ['category', 'subcategory'] as const;
const COMPANY_DASHBOARD_TABS = ['summary', 'projects', 'settings'] as const;

type ProjectWorkspaceTab = (typeof PROJECT_WORKSPACE_TABS)[number];
type Quarter = (typeof QUARTERS)[number];
type TransactionView = (typeof TRANSACTION_VIEWS)[number];
type ProjectWorkspaceSource = (typeof PROJECT_WORKSPACE_SOURCES)[number];
type ProjectWorkspaceFocus = (typeof PROJECT_WORKSPACE_FOCUSES)[number];
type DrilldownKind = (typeof DRILLDOWN_KINDS)[number];
type CompanyDashboardTab = (typeof COMPANY_DASHBOARD_TABS)[number];

export interface ProjectWorkspaceSearch {
  tab?: ProjectWorkspaceTab;
  year?: string;
  quarter?: Quarter;
  month?: string;
  view?: TransactionView;
  q?: string;
  commentTxn?: string;
  commentId?: string;
  source?: ProjectWorkspaceSource;
  focus?: ProjectWorkspaceFocus;
  drilldownKind?: DrilldownKind;
  categoryId?: string;
  subCategoryId?: string;
  categoryName?: string;
  subCategoryName?: string;
}

export interface CompanyDashboardSearch {
  tab?: CompanyDashboardTab;
  exportJob?: string;
  review?: 'rule-suggestions';
}

interface PasswordLinkSearch {
  token?: string;
  error?: string;
}

function hasOwn(search: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(search, key);
}

function optionalEnum<const T extends readonly string[]>(
  value: unknown,
  values: T
): T[number] | undefined {
  return typeof value === 'string' && values.includes(value)
    ? (value as T[number])
    : undefined;
}

function optionalTrimmedString(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    trim?: boolean;
  } = {}
): string | undefined {
  if (typeof value !== 'string') return undefined;

  const parsed = options.trim === false ? value : value.trim();
  if (options.minLength !== undefined && parsed.length < options.minLength) {
    return undefined;
  }
  if (options.maxLength !== undefined && parsed.length > options.maxLength) {
    return undefined;
  }
  if (options.pattern && !options.pattern.test(parsed)) return undefined;
  return parsed;
}

export function parseProjectWorkspaceSearch(
  search: Record<string, unknown>
): ProjectWorkspaceSearch {
  const parsed: ProjectWorkspaceSearch = {};

  const tab = optionalEnum(search.tab, PROJECT_WORKSPACE_TABS);
  if (tab !== undefined) parsed.tab = tab;

  const year = optionalTrimmedString(search.year, {
    pattern: /^\d{4}$/,
    trim: false,
  });
  if (year !== undefined) parsed.year = year;

  const quarter = optionalEnum(search.quarter, QUARTERS);
  if (quarter !== undefined) parsed.quarter = quarter;

  const month = optionalTrimmedString(search.month, {
    pattern: /^\d{4}-\d{2}$/,
    trim: false,
  });
  if (month !== undefined) parsed.month = month;

  const view = optionalEnum(search.view, TRANSACTION_VIEWS);
  if (view !== undefined) parsed.view = view;

  const query = optionalTrimmedString(search.q, {
    minLength: 2,
    maxLength: 200,
  });
  if (query !== undefined) parsed.q = query;

  const commentTxn = optionalTrimmedString(search.commentTxn, {
    minLength: 1,
  });
  if (commentTxn !== undefined) parsed.commentTxn = commentTxn;

  const commentId = optionalTrimmedString(search.commentId, {
    minLength: 1,
  });
  if (commentId !== undefined) parsed.commentId = commentId;

  const source = optionalEnum(search.source, PROJECT_WORKSPACE_SOURCES);
  if (source !== undefined) parsed.source = source;

  const focus = optionalEnum(search.focus, PROJECT_WORKSPACE_FOCUSES);
  if (focus !== undefined) parsed.focus = focus;

  const drilldownKind = optionalEnum(search.drilldownKind, DRILLDOWN_KINDS);
  if (drilldownKind !== undefined) parsed.drilldownKind = drilldownKind;

  const categoryId = optionalTrimmedString(search.categoryId, {
    minLength: 1,
  });
  if (categoryId !== undefined) parsed.categoryId = categoryId;

  const subCategoryId = optionalTrimmedString(search.subCategoryId, {
    minLength: 1,
  });
  if (subCategoryId !== undefined) parsed.subCategoryId = subCategoryId;

  const categoryName = optionalTrimmedString(search.categoryName, {
    minLength: 1,
  });
  if (categoryName !== undefined) parsed.categoryName = categoryName;

  const subCategoryName = optionalTrimmedString(search.subCategoryName, {
    minLength: 1,
  });
  if (subCategoryName !== undefined) parsed.subCategoryName = subCategoryName;

  return parsed;
}

export function parseCompanyDashboardSearch(
  search: Record<string, unknown>
): CompanyDashboardSearch {
  const parsed: CompanyDashboardSearch = {};

  if (hasOwn(search, 'tab') && search.tab !== undefined) {
    const tab = optionalEnum(search.tab, COMPANY_DASHBOARD_TABS);
    if (!tab) return {};
    parsed.tab = tab;
  }
  if (hasOwn(search, 'exportJob') && search.exportJob !== undefined) {
    const exportJob = optionalTrimmedString(search.exportJob, {
      minLength: 1,
    });
    if (!exportJob) return {};
    parsed.exportJob = exportJob;
  }
  if (hasOwn(search, 'review') && search.review !== undefined) {
    if (search.review === 'rule-suggestions') {
      parsed.review = search.review;
    } else {
      return {};
    }
  }

  return parsed;
}

function parsePasswordLinkValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value.trim() : '';
}

export function parseResetPasswordSearch(
  search: Record<string, unknown>
): PasswordLinkSearch {
  const parsed: PasswordLinkSearch = {};
  if (hasOwn(search, 'token')) {
    const token = parsePasswordLinkValue(search.token);
    if (token !== undefined) parsed.token = token;
  }
  if (hasOwn(search, 'error')) {
    const error = parsePasswordLinkValue(search.error);
    if (error !== undefined) parsed.error = error;
  }
  return parsed;
}

export function parseVerifyEmailChangeSearch(
  search: Record<string, unknown>
): Pick<PasswordLinkSearch, 'token'> {
  const parsed: Pick<PasswordLinkSearch, 'token'> = {};
  if (hasOwn(search, 'token')) {
    const token = parsePasswordLinkValue(search.token);
    if (token !== undefined) parsed.token = token;
  }
  return parsed;
}

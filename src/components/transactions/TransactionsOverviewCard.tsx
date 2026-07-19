import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';

import { formatCurrencyFromCents } from '../../utils/money';
import TransactionBulkActionsBar from './TransactionBulkActionsBar';

export type TransactionView =
  | 'all'
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'assigned-to-me'
  | 'pending-reversal';

type TransactionsPageSummary = {
  totalCount: number;
  budgetImpactCents: number;
  pendingReversalCount: number;
  pendingReversalCents: number;
  adjustedBudgetImpactCents: number;
  uncodedCount: number;
  uncodedCents: number;
  sourceOnlyCount: number;
  assignedToMeCount: number;
  reviewedCount: number;
  lockedCount: number;
  invalidDateCount: number;
};

export default function TransactionsOverviewCard(props: {
  pageSummary: TransactionsPageSummary;
  currencyCode: string;
  autoMappedPendingCount: number;
  isHydrated: boolean;
  isMobile: boolean;
  transactionView: TransactionView;
  setTransactionView: (value: TransactionView) => void;
  readOnly: boolean;
  canEditTaxonomy: boolean;
  onApproveAllAutoMappings: () => void;
  onOpenTaxonomyManager: () => void;
  selectedTxnCount: number;
  selectedCountLabel: string;
  selectedAutoMappedPendingCount: number;
  selectedUnlockedCategorisableCount: number;
  onClearSelection: () => void;
  onMarkReviewed: () => void;
  onMarkUnreviewed: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onApproveAutoMappings: () => void;
  onOpenRecode: () => void;
  onClearCoding: () => void;
  drilldownLabel: string | null;
  onClearDrilldown: () => void;
  invalidDateCount: number;
  projectRuleError: string | null;
  projectRulePromptOpen: boolean;
  onResetPage: () => void;
}) {
  const {
    pageSummary,
    currencyCode,
    autoMappedPendingCount,
    isHydrated,
    isMobile,
    transactionView,
    setTransactionView,
    readOnly,
    canEditTaxonomy,
    onApproveAllAutoMappings,
    onOpenTaxonomyManager,
    selectedTxnCount,
    selectedCountLabel,
    selectedAutoMappedPendingCount,
    selectedUnlockedCategorisableCount,
    onClearSelection,
    onMarkReviewed,
    onMarkUnreviewed,
    onLock,
    onUnlock,
    onApproveAutoMappings,
    onOpenRecode,
    onClearCoding,
    drilldownLabel,
    onClearDrilldown,
    invalidDateCount,
    projectRuleError,
    projectRulePromptOpen,
    onResetPage,
  } = props;

  return (
    <Paper radius="xl" p="md">
      <Stack gap="md">
        <Group gap="sm" align="center" wrap="wrap">
          <Badge variant="light">{pageSummary.totalCount} shown</Badge>
          <Badge
            variant="light"
            color={pageSummary.uncodedCount > 0 ? 'red' : 'gray'}
          >
            {pageSummary.uncodedCount} uncoded
            {pageSummary.uncodedCount > 0
              ? ` · ${formatCurrencyFromCents(
                  pageSummary.uncodedCents,
                  currencyCode
                )}`
              : ''}
          </Badge>
          {pageSummary.assignedToMeCount > 0 ? (
            <Badge variant="light" color="orange">
              {pageSummary.assignedToMeCount} assigned to me
            </Badge>
          ) : null}
          {pageSummary.reviewedCount > 0 ? (
            <Badge variant="light" color="green">
              {pageSummary.reviewedCount} reviewed
            </Badge>
          ) : null}
          {pageSummary.lockedCount > 0 ? (
            <Badge variant="light" color="gray">
              {pageSummary.lockedCount} locked
            </Badge>
          ) : null}
          {pageSummary.pendingReversalCount > 0 ? (
            <Badge variant="light" color="violet">
              {pageSummary.pendingReversalCount} pending reversal
              {` · ${formatCurrencyFromCents(
                pageSummary.pendingReversalCents,
                currencyCode
              )}`}
            </Badge>
          ) : null}
          <Badge
            variant="light"
            color={autoMappedPendingCount > 0 ? 'yellow' : 'gray'}
          >
            {autoMappedPendingCount} pending review
          </Badge>
          <Badge variant="outline" color="blue">
            Budget impact{' '}
            {formatCurrencyFromCents(
              pageSummary.budgetImpactCents,
              currencyCode
            )}
            {' -> '}
            {formatCurrencyFromCents(
              pageSummary.adjustedBudgetImpactCents,
              currencyCode
            )}
          </Badge>
        </Group>

        {isHydrated ? (
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="View"
              data={[
                { value: 'all', label: 'All' },
                { value: 'uncoded', label: 'Uncoded only' },
                {
                  value: 'auto-mapped-pending',
                  label: 'Auto-mapped pending approval',
                },
                { value: 'assigned-to-me', label: 'Assigned to me' },
                { value: 'pending-reversal', label: 'Pending reversal' },
              ]}
              value={transactionView}
              onChange={(value) => {
                onClearSelection();
                onResetPage();
                setTransactionView(
                  value === 'uncoded' ||
                    value === 'auto-mapped-pending' ||
                    value === 'assigned-to-me' ||
                    value === 'pending-reversal'
                    ? value
                    : 'all'
                );
              }}
              style={{ width: isMobile ? '100%' : 250 }}
            />
            <Button
              variant="light"
              color="teal"
              size="sm"
              fullWidth={isMobile}
              disabled={readOnly || autoMappedPendingCount === 0}
              onClick={onApproveAllAutoMappings}
            >
              Accept all auto-mappings ({autoMappedPendingCount})
            </Button>
            <Button
              variant="light"
              size="sm"
              fullWidth={isMobile}
              disabled={readOnly || !canEditTaxonomy}
              onClick={onOpenTaxonomyManager}
            >
              Manage categories
            </Button>
          </Group>
        ) : (
          <Paper p="md">
            <Text size="sm" c="dimmed">
              Loading transaction controls...
            </Text>
          </Paper>
        )}

        {isHydrated && !readOnly && selectedTxnCount > 0 ? (
          <TransactionBulkActionsBar
            selectedCountLabel={selectedCountLabel}
            selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
            selectedUnlockedCategorisableCount={
              selectedUnlockedCategorisableCount
            }
            onClearSelection={onClearSelection}
            onMarkReviewed={onMarkReviewed}
            onMarkUnreviewed={onMarkUnreviewed}
            onLock={onLock}
            onUnlock={onUnlock}
            onApproveAutoMappings={onApproveAutoMappings}
            onOpenRecode={onOpenRecode}
            onClearCoding={onClearCoding}
          />
        ) : null}

        {drilldownLabel ? (
          <Group gap="sm" align="center" wrap="wrap">
            <Badge variant="light" color="blue">
              Budget drilldown
            </Badge>
            <Text size="sm" c="dimmed">
              Showing budget-impact transactions for {drilldownLabel}.
            </Text>
            <Button size="xs" variant="subtle" onClick={onClearDrilldown}>
              Clear drilldown
            </Button>
          </Group>
        ) : null}

        {invalidDateCount > 0 ? (
          <Text size="sm" c="dimmed">
            {invalidDateCount} transaction(s) have invalid dates and may be
            excluded from month filters or rollups.
          </Text>
        ) : null}

        {projectRuleError && !projectRulePromptOpen ? (
          <Alert color="red">{projectRuleError}</Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}

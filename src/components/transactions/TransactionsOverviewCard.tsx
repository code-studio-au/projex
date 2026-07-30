import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';

import TransactionBulkActionsBar from './TransactionBulkActionsBar';
import {
  transactionWorkflowBadges,
  transactionWorkflowHeading,
} from './transactionWorkflowSummary';
import type { TransactionView } from './transactionViews';
import type { TxnBulkSelectionRow } from '../../api/types';
import { formatCurrencyFromCents } from '../../utils/money';

type TransactionsPageSummary = {
  totalCount: number;
  uncodedCount: number;
  codingApprovalCount: number;
  reversalReviewCount: number;
  reversalMatchReviewCount: number;
  awaitingReversalCount: number;
  assignedToMeCount: number;
};

function useTransactionsOverviewCardController(props: {
  pageSummary: TransactionsPageSummary;
  transactionView: TransactionView;
  currencyCode: string;
  projectAutoMappedPendingCount: number;
  isHydrated: boolean;
  isMobile: boolean;
  readOnly: boolean;
  canEditTaxonomy: boolean;
  canManageReversals: boolean;
  canAdminUnlock: boolean;
  reconcilingPendingReversals: boolean;
  loadingReversalReviewQueue: boolean;
  onReconcilePendingReversals: () => void;
  onOpenReversalReviewQueue: () => void;
  onApproveAllAutoMappings: () => void;
  onOpenTaxonomyManager: () => void;
  selectedTxnCount: number;
  selectedCountLabel: string;
  selectableTxnCount: number;
  selectingAll: boolean;
  selectedAutoMappedPendingCount: number;
  selectedAmbiguousSuggestedReversalCount: number;
  selectedSuggestedReversalCount: number;
  selectedSuggestedReversalPairs: Array<
    NonNullable<TxnBulkSelectionRow['reversal']>
  >;
  selectedUnlockedCategorisableCount: number;
  selectedDeletableCount: number;
  selectedLockEligibleCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkReviewed: () => void;
  onMarkUnreviewed: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onApproveAutoMappings: () => void;
  onOpenRecode: () => void;
  onClearCoding: () => void;
  bulkDeleteConfirmOpen: boolean;
  bulkApproveSuggestedReversalsConfirmOpen: boolean;
  onOpenBulkDeleteConfirm: () => void;
  onCloseBulkDeleteConfirm: () => void;
  onConfirmBulkDelete: () => void;
  onOpenBulkApproveSuggestedReversalsConfirm: () => void;
  onCloseBulkApproveSuggestedReversalsConfirm: () => void;
  onConfirmBulkApproveSuggestedReversals: () => void;
  drilldownLabel: string | null;
  onClearDrilldown: () => void;
  invalidDateCount: number;
  projectRuleError: string | null;
  projectRulePromptOpen: boolean;
}) {
  const {
    pageSummary,
    transactionView,
    currencyCode,
    projectAutoMappedPendingCount,
    isHydrated,
    isMobile,
    readOnly,
    canEditTaxonomy,
    canManageReversals,
    canAdminUnlock,
    reconcilingPendingReversals,
    loadingReversalReviewQueue,
    onReconcilePendingReversals,
    onOpenReversalReviewQueue,
    onApproveAllAutoMappings,
    onOpenTaxonomyManager,
    selectedTxnCount,
    selectedCountLabel,
    selectableTxnCount,
    selectingAll,
    selectedAutoMappedPendingCount,
    selectedAmbiguousSuggestedReversalCount,
    selectedSuggestedReversalCount,
    selectedSuggestedReversalPairs,
    selectedUnlockedCategorisableCount,
    selectedDeletableCount,
    selectedLockEligibleCount,
    onSelectAll,
    onClearSelection,
    onMarkReviewed,
    onMarkUnreviewed,
    onLock,
    onUnlock,
    onApproveAutoMappings,
    onOpenRecode,
    onClearCoding,
    bulkDeleteConfirmOpen,
    bulkApproveSuggestedReversalsConfirmOpen,
    onOpenBulkDeleteConfirm,
    onCloseBulkDeleteConfirm,
    onConfirmBulkDelete,
    onOpenBulkApproveSuggestedReversalsConfirm,
    onCloseBulkApproveSuggestedReversalsConfirm,
    onConfirmBulkApproveSuggestedReversals,
    drilldownLabel,
    onClearDrilldown,
    invalidDateCount,
    projectRuleError,
    projectRulePromptOpen,
  } = props;
  const workflowHeading = transactionWorkflowHeading(
    transactionView,
    pageSummary.totalCount
  );
  const workflowBadges = transactionWorkflowBadges(
    transactionView,
    pageSummary
  );

  return {
    bulkApproveSuggestedReversalsConfirmOpen,
    bulkDeleteConfirmOpen,
    canAdminUnlock,
    canEditTaxonomy,
    canManageReversals,
    currencyCode,
    drilldownLabel,
    invalidDateCount,
    isHydrated,
    isMobile,
    loadingReversalReviewQueue,
    onApproveAllAutoMappings,
    onApproveAutoMappings,
    onClearCoding,
    onClearDrilldown,
    onClearSelection,
    onCloseBulkApproveSuggestedReversalsConfirm,
    onCloseBulkDeleteConfirm,
    onConfirmBulkApproveSuggestedReversals,
    onConfirmBulkDelete,
    onLock,
    onMarkReviewed,
    onMarkUnreviewed,
    onOpenBulkApproveSuggestedReversalsConfirm,
    onOpenBulkDeleteConfirm,
    onOpenRecode,
    onOpenReversalReviewQueue,
    onOpenTaxonomyManager,
    onReconcilePendingReversals,
    onSelectAll,
    onUnlock,
    pageSummary,
    projectAutoMappedPendingCount,
    projectRuleError,
    projectRulePromptOpen,
    readOnly,
    reconcilingPendingReversals,
    selectableTxnCount,
    selectedAmbiguousSuggestedReversalCount,
    selectedAutoMappedPendingCount,
    selectedCountLabel,
    selectedDeletableCount,
    selectedLockEligibleCount,
    selectedSuggestedReversalCount,
    selectedSuggestedReversalPairs,
    selectedTxnCount,
    selectedUnlockedCategorisableCount,
    selectingAll,
    workflowBadges,
    workflowHeading,
  };
}

type TransactionsOverviewCardController = ReturnType<
  typeof useTransactionsOverviewCardController
>;

function TransactionsOverviewCardView({
  model,
}: {
  model: TransactionsOverviewCardController;
}) {
  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <Group gap="sm" align="center" wrap="wrap">
            <Text fw={650}>{model.workflowHeading}</Text>
            {model.workflowBadges.map((badge) => (
              <Badge
                key={`${badge.color}-${badge.label}`}
                variant="light"
                color={badge.color}
              >
                {badge.label}
              </Badge>
            ))}
          </Group>

          {model.isHydrated ? (
            <Group
              gap="sm"
              wrap="wrap"
              style={{ width: model.isMobile ? '100%' : undefined }}
            >
              {model.pageSummary.reversalMatchReviewCount > 0 &&
              model.canManageReversals &&
              !model.readOnly ? (
                <Button
                  variant="light"
                  size="sm"
                  loading={model.loadingReversalReviewQueue}
                  fullWidth={model.isMobile}
                  onClick={model.onOpenReversalReviewQueue}
                >
                  Review matches ({model.pageSummary.reversalMatchReviewCount})
                </Button>
              ) : null}
              <Menu withinPortal position="bottom-end" shadow="md">
                <Menu.Target>
                  <Button
                    variant="default"
                    size="sm"
                    fullWidth={model.isMobile}
                  >
                    Tools
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {model.projectAutoMappedPendingCount > 0 &&
                  !model.readOnly ? (
                    <>
                      <Menu.Item onClick={model.onApproveAllAutoMappings}>
                        Approve all project coding (
                        {model.projectAutoMappedPendingCount})
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  ) : null}
                  <Menu.Item
                    disabled={
                      model.readOnly ||
                      !model.canManageReversals ||
                      model.reconcilingPendingReversals
                    }
                    onClick={model.onReconcilePendingReversals}
                  >
                    {model.reconcilingPendingReversals
                      ? 'Finding reversal matches...'
                      : 'Find reversal matches'}
                  </Menu.Item>
                  <Menu.Item
                    disabled={model.readOnly || !model.canEditTaxonomy}
                    onClick={model.onOpenTaxonomyManager}
                  >
                    Manage categories
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          ) : null}
        </Group>

        {model.isHydrated && !model.readOnly && model.selectedTxnCount > 0 ? (
          <TransactionBulkActionsBar
            selectedTxnCount={model.selectedTxnCount}
            selectedCountLabel={model.selectedCountLabel}
            selectableTxnCount={model.selectableTxnCount}
            selectingAll={model.selectingAll}
            selectedAutoMappedPendingCount={
              model.selectedAutoMappedPendingCount
            }
            selectedSuggestedReversalCount={
              model.selectedSuggestedReversalCount
            }
            selectedUnlockedCategorisableCount={
              model.selectedUnlockedCategorisableCount
            }
            selectedDeletableCount={model.selectedDeletableCount}
            selectedLockEligibleCount={model.selectedLockEligibleCount}
            canManageReversals={model.canManageReversals}
            canAdminUnlock={model.canAdminUnlock}
            onSelectAll={model.onSelectAll}
            onClearSelection={model.onClearSelection}
            onMarkReviewed={model.onMarkReviewed}
            onMarkUnreviewed={model.onMarkUnreviewed}
            onLock={model.onLock}
            onUnlock={model.onUnlock}
            onApproveAutoMappings={model.onApproveAutoMappings}
            onApproveSuggestedReversals={
              model.onOpenBulkApproveSuggestedReversalsConfirm
            }
            onOpenRecode={model.onOpenRecode}
            onClearCoding={model.onClearCoding}
            onDeleteSelected={model.onOpenBulkDeleteConfirm}
          />
        ) : null}

        {model.drilldownLabel ? (
          <Group gap="sm" align="center" wrap="wrap">
            <Badge variant="light" color="blue">
              Budget drilldown
            </Badge>
            <Text size="sm" c="dimmed">
              Showing budget-impact transactions for {model.drilldownLabel}.
            </Text>
            <Button size="xs" variant="subtle" onClick={model.onClearDrilldown}>
              Clear drilldown
            </Button>
          </Group>
        ) : null}

        {model.invalidDateCount > 0 ? (
          <Text size="sm" c="orange.8">
            {model.invalidDateCount} transaction(s) have invalid dates and may
            be excluded from month filters or rollups.
          </Text>
        ) : null}

        {model.projectRuleError && !model.projectRulePromptOpen ? (
          <Alert color="red">{model.projectRuleError}</Alert>
        ) : null}
      </Stack>

      <Modal
        opened={model.bulkApproveSuggestedReversalsConfirmOpen}
        onClose={model.onCloseBulkApproveSuggestedReversalsConfirm}
        title="Approve selected reversal matches?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {model.selectedAmbiguousSuggestedReversalCount > 0
              ? `You have selected to approve ${model.selectedSuggestedReversalCount} reversal match${
                  model.selectedSuggestedReversalCount === 1 ? '' : 'es'
                }. ${model.selectedAmbiguousSuggestedReversalCount} ${
                  model.selectedAmbiguousSuggestedReversalCount === 1
                    ? 'was'
                    : 'were'
                } auto-matched to the closest default matching reversal because multiple possible matches existed. Continue with the selected defaults?`
              : 'This will approve the selected auto-matched reversal review items using their recommended matches and mark them as reversed.'}
          </Text>
          <Stack gap="xs">
            {model.selectedSuggestedReversalPairs.map((reversal) => (
              <Paper key={reversal.id} withBorder radius="md" p="sm">
                <Text size="sm" fw={600}>
                  {reversal.sourceTxn?.item ?? 'Source transaction'} to{' '}
                  {reversal.counterpartTxn?.item ?? 'Reversal transaction'}
                </Text>
                <Text size="xs" c="dimmed">
                  {reversal.sourceTxn?.date ?? 'Unknown date'} ·{' '}
                  {reversal.sourceTxn?.amountCents !== undefined
                    ? formatCurrencyFromCents(
                        reversal.sourceTxn.amountCents,
                        model.currencyCode
                      )
                    : 'Unknown amount'}
                  {' -> '}
                  {reversal.counterpartTxn?.date ?? 'Unknown date'} ·{' '}
                  {reversal.counterpartTxn?.amountCents !== undefined
                    ? formatCurrencyFromCents(
                        reversal.counterpartTxn.amountCents,
                        model.currencyCode
                      )
                    : 'Unknown amount'}
                </Text>
                <Badge
                  mt={6}
                  size="xs"
                  color={
                    reversal.matchMethod === 'auto_default' ? 'orange' : 'blue'
                  }
                  variant="light"
                >
                  {reversal.matchMethod === 'auto_default'
                    ? 'Default match'
                    : 'Recommended match'}
                </Badge>
              </Paper>
            ))}
          </Stack>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={model.onCloseBulkApproveSuggestedReversalsConfirm}
            >
              Cancel
            </Button>
            <Button
              color="blue"
              onClick={model.onConfirmBulkApproveSuggestedReversals}
            >
              Approve selected matches
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={model.bulkDeleteConfirmOpen}
        onClose={model.onCloseBulkDeleteConfirm}
        title="Delete selected transactions?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This will permanently delete the selected unlocked transactions that
            are not part of a reversal workflow. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={model.onCloseBulkDeleteConfirm}>
              Cancel
            </Button>
            <Button color="red" onClick={model.onConfirmBulkDelete}>
              Delete selected
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default function TransactionsOverviewCard(
  props: Parameters<typeof useTransactionsOverviewCardController>[0]
) {
  const model = useTransactionsOverviewCardController(props);
  return <TransactionsOverviewCardView model={model} />;
}

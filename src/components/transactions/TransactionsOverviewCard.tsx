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

export default function TransactionsOverviewCard(props: {
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

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <Group gap="sm" align="center" wrap="wrap">
            <Text fw={650}>{workflowHeading}</Text>
            {workflowBadges.map((badge) => (
              <Badge
                key={`${badge.color}-${badge.label}`}
                variant="light"
                color={badge.color}
              >
                {badge.label}
              </Badge>
            ))}
          </Group>

          {isHydrated ? (
            <Group
              gap="sm"
              wrap="wrap"
              style={{ width: isMobile ? '100%' : undefined }}
            >
              {pageSummary.reversalMatchReviewCount > 0 &&
              canManageReversals &&
              !readOnly ? (
                <Button
                  variant="light"
                  size="sm"
                  loading={loadingReversalReviewQueue}
                  fullWidth={isMobile}
                  onClick={onOpenReversalReviewQueue}
                >
                  Review matches ({pageSummary.reversalMatchReviewCount})
                </Button>
              ) : null}
              <Menu withinPortal position="bottom-end" shadow="md">
                <Menu.Target>
                  <Button variant="default" size="sm" fullWidth={isMobile}>
                    Tools
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {projectAutoMappedPendingCount > 0 && !readOnly ? (
                    <>
                      <Menu.Item onClick={onApproveAllAutoMappings}>
                        Approve all project coding (
                        {projectAutoMappedPendingCount})
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  ) : null}
                  <Menu.Item
                    disabled={
                      readOnly ||
                      !canManageReversals ||
                      reconcilingPendingReversals
                    }
                    onClick={onReconcilePendingReversals}
                  >
                    {reconcilingPendingReversals
                      ? 'Finding reversal matches...'
                      : 'Find reversal matches'}
                  </Menu.Item>
                  <Menu.Item
                    disabled={readOnly || !canEditTaxonomy}
                    onClick={onOpenTaxonomyManager}
                  >
                    Manage categories
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          ) : null}
        </Group>

        {isHydrated && !readOnly && selectedTxnCount > 0 ? (
          <TransactionBulkActionsBar
            selectedTxnCount={selectedTxnCount}
            selectedCountLabel={selectedCountLabel}
            selectableTxnCount={selectableTxnCount}
            selectingAll={selectingAll}
            selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
            selectedSuggestedReversalCount={selectedSuggestedReversalCount}
            selectedUnlockedCategorisableCount={
              selectedUnlockedCategorisableCount
            }
            selectedDeletableCount={selectedDeletableCount}
            canManageReversals={canManageReversals}
            canAdminUnlock={canAdminUnlock}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onMarkReviewed={onMarkReviewed}
            onMarkUnreviewed={onMarkUnreviewed}
            onLock={onLock}
            onUnlock={onUnlock}
            onApproveAutoMappings={onApproveAutoMappings}
            onApproveSuggestedReversals={
              onOpenBulkApproveSuggestedReversalsConfirm
            }
            onOpenRecode={onOpenRecode}
            onClearCoding={onClearCoding}
            onDeleteSelected={onOpenBulkDeleteConfirm}
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
          <Text size="sm" c="orange.8">
            {invalidDateCount} transaction(s) have invalid dates and may be
            excluded from month filters or rollups.
          </Text>
        ) : null}

        {projectRuleError && !projectRulePromptOpen ? (
          <Alert color="red">{projectRuleError}</Alert>
        ) : null}
      </Stack>

      <Modal
        opened={bulkApproveSuggestedReversalsConfirmOpen}
        onClose={onCloseBulkApproveSuggestedReversalsConfirm}
        title="Approve selected reversal matches?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {selectedAmbiguousSuggestedReversalCount > 0
              ? `You have selected to approve ${selectedSuggestedReversalCount} reversal match${
                  selectedSuggestedReversalCount === 1 ? '' : 'es'
                }. ${selectedAmbiguousSuggestedReversalCount} ${
                  selectedAmbiguousSuggestedReversalCount === 1 ? 'was' : 'were'
                } auto-matched to the closest default matching reversal because multiple possible matches existed. Continue with the selected defaults?`
              : 'This will approve the selected auto-matched reversal review items using their recommended matches and mark them as reversed.'}
          </Text>
          <Stack gap="xs">
            {selectedSuggestedReversalPairs.map((reversal) => (
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
                        currencyCode
                      )
                    : 'Unknown amount'}
                  {' -> '}
                  {reversal.counterpartTxn?.date ?? 'Unknown date'} ·{' '}
                  {reversal.counterpartTxn?.amountCents !== undefined
                    ? formatCurrencyFromCents(
                        reversal.counterpartTxn.amountCents,
                        currencyCode
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
              onClick={onCloseBulkApproveSuggestedReversalsConfirm}
            >
              Cancel
            </Button>
            <Button
              color="blue"
              onClick={onConfirmBulkApproveSuggestedReversals}
            >
              Approve selected matches
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={bulkDeleteConfirmOpen}
        onClose={onCloseBulkDeleteConfirm}
        title="Delete selected transactions?"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This will permanently delete the selected unlocked transactions that
            are not part of a reversal workflow. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onCloseBulkDeleteConfirm}>
              Cancel
            </Button>
            <Button color="red" onClick={onConfirmBulkDelete}>
              Delete selected
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

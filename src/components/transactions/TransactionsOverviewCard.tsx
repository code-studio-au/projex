import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
} from '@mantine/core';

import TransactionBulkActionsBar from './TransactionBulkActionsBar';
import {
  transactionWorkflowBadges,
  transactionWorkflowHeading,
} from './transactionWorkflowSummary';
import type { TransactionView } from './transactionViews';

type TransactionsPageSummary = {
  totalCount: number;
  uncodedCount: number;
  codingApprovalCount: number;
  reversalReviewCount: number;
  awaitingReversalCount: number;
  assignedToMeCount: number;
};

export default function TransactionsOverviewCard(props: {
  pageSummary: TransactionsPageSummary;
  transactionView: TransactionView;
  projectAutoMappedPendingCount: number;
  isHydrated: boolean;
  isMobile: boolean;
  readOnly: boolean;
  canEditTaxonomy: boolean;
  canManageReversals: boolean;
  reconcilingPendingReversals: boolean;
  onReconcilePendingReversals: () => void;
  onApproveAllAutoMappings: () => void;
  onOpenTaxonomyManager: () => void;
  selectedTxnCount: number;
  selectedCountLabel: string;
  selectedAutoMappedPendingCount: number;
  selectedAmbiguousSuggestedReversalCount: number;
  selectedSuggestedReversalCount: number;
  selectedUnlockedCategorisableCount: number;
  selectedDeletableCount: number;
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
    projectAutoMappedPendingCount,
    isHydrated,
    isMobile,
    readOnly,
    canEditTaxonomy,
    canManageReversals,
    reconcilingPendingReversals,
    onReconcilePendingReversals,
    onApproveAllAutoMappings,
    onOpenTaxonomyManager,
    selectedTxnCount,
    selectedCountLabel,
    selectedAutoMappedPendingCount,
    selectedAmbiguousSuggestedReversalCount,
    selectedSuggestedReversalCount,
    selectedUnlockedCategorisableCount,
    selectedDeletableCount,
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
            selectedCountLabel={selectedCountLabel}
            selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
            selectedSuggestedReversalCount={selectedSuggestedReversalCount}
            selectedUnlockedCategorisableCount={
              selectedUnlockedCategorisableCount
            }
            selectedDeletableCount={selectedDeletableCount}
            canManageReversals={canManageReversals}
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
          <Group justify="flex-end">
            <Button
              variant="light"
              color="gray"
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
            <Button
              variant="light"
              color="gray"
              onClick={onCloseBulkDeleteConfirm}
            >
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

import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';

import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import { useProjectAutoCodingRulesQuery } from '../../queries/projectAutoCodingRules';
import { useBulkRecodeProjectTransactionsMutation } from '../../queries/taxonomy';
import classes from '../../styles/ui.module.css';
import { asCategoryId, asSubCategoryId } from '../../types/ids';
import { firefoxSafeModalSelectProps } from '../modalSelectProps';
import type {
  TaxonomyDeleteTarget,
  TaxonomySubCategoryActionTarget,
} from './taxonomyActionTypes';
import {
  getTaxonomyDeleteAffectedSubCategoryIds,
  getTaxonomySubCategoryOptions,
  resolveTaxonomyDeleteRuleHandling,
} from './taxonomyActionModel';

export default function TaxonomyActionDialogs(props: {
  taxonomy: TaxonomyHook;
  isMobile: boolean;
  error: string | null;
  pendingMove: TaxonomySubCategoryActionTarget | null;
  pendingBulkRecode: TaxonomySubCategoryActionTarget | null;
  pendingDelete: TaxonomyDeleteTarget | null;
  onCloseMove: () => void;
  onCloseBulkRecode: () => void;
  onCloseDelete: () => void;
  onClearMessages: () => void;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
}) {
  const {
    taxonomy,
    isMobile,
    error,
    pendingMove,
    pendingBulkRecode,
    pendingDelete,
    onCloseMove,
    onCloseBulkRecode,
    onCloseDelete,
    onClearMessages,
    onError,
    onStatus,
  } = props;
  const bulkRecode = useBulkRecodeProjectTransactionsMutation(
    taxonomy.projectId
  );
  const autoCodingRulesQ = useProjectAutoCodingRulesQuery(taxonomy.projectId);
  const [moveCategoryId, setMoveCategoryId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [selectedBulkRecodeCategoryId, setSelectedBulkRecodeCategoryId] =
    useState<string | null | undefined>(undefined);
  const [bulkRecodeSubCategoryId, setBulkRecodeSubCategoryId] = useState<
    string | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedDeleteRuleHandling, setSelectedDeleteRuleHandling] = useState<
    'delete' | 'reassign' | null
  >(null);
  const [deleteReplacementCategoryId, setDeleteReplacementCategoryId] =
    useState<string | null>(null);
  const [deleteReplacementSubCategoryId, setDeleteReplacementSubCategoryId] =
    useState<string | null>(null);

  const categoryOptions = taxonomy.categoryOptions;
  const autoCodingRules = autoCodingRulesQ.data ?? [];
  const moveCategoryOptions = categoryOptions.filter(
    (option) => option.value !== pendingMove?.currentCategoryId
  );
  const moveAffectedRules = pendingMove
    ? autoCodingRules.filter(
        (rule) => rule.subCategoryId === pendingMove.subCategoryId
      )
    : [];
  const bulkRecodeCategoryId =
    selectedBulkRecodeCategoryId === undefined
      ? (pendingBulkRecode?.currentCategoryId ?? null)
      : selectedBulkRecodeCategoryId;
  const bulkRecodeSubCategoryOptions = getTaxonomySubCategoryOptions({
    subCategories: taxonomy.subCategories,
    categoryId: bulkRecodeCategoryId,
    excludedIds: new Set(
      pendingBulkRecode ? [pendingBulkRecode.subCategoryId] : []
    ),
  });
  const deleteAffectedSubCategoryIds = getTaxonomyDeleteAffectedSubCategoryIds({
    target: pendingDelete,
    subCategories: taxonomy.subCategories,
  });
  const deleteAffectedRules = autoCodingRules.filter((rule) =>
    deleteAffectedSubCategoryIds.has(rule.subCategoryId)
  );
  const deleteRuleHandling = resolveTaxonomyDeleteRuleHandling({
    selected: selectedDeleteRuleHandling,
    target: pendingDelete,
    affectedRuleCount: deleteAffectedRules.length,
  });
  const deleteReplacementSubCategoryOptions = getTaxonomySubCategoryOptions({
    subCategories: taxonomy.subCategories,
    categoryId: deleteReplacementCategoryId,
    excludedIds: deleteAffectedSubCategoryIds,
  });

  function closeMove() {
    setMoveCategoryId(null);
    onCloseMove();
  }

  function closeBulkRecode() {
    setSelectedBulkRecodeCategoryId(undefined);
    setBulkRecodeSubCategoryId(null);
    onCloseBulkRecode();
  }

  function closeDelete() {
    setSelectedDeleteRuleHandling(null);
    setDeleteReplacementCategoryId(null);
    setDeleteReplacementSubCategoryId(null);
    onCloseDelete();
  }

  return (
    <>
      <Modal
        opened={!!pendingMove}
        onClose={closeMove}
        title="Move subcategory"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Move “{pendingMove?.subCategoryName ?? ''}” to another category. Its
            budget line moves with it, and unlocked transactions using it will
            be updated to the new category.
          </Text>
          {moveAffectedRules.length > 0 ? (
            <Alert color="blue" title="Auto-coding impact">
              {moveAffectedRules.length}{' '}
              {moveAffectedRules.length === 1 ? 'rule' : 'rules'} targeting this
              exact subcategory ID will follow the move automatically
              {moveCategoryId
                ? ` to ${
                    taxonomy.categories.find(
                      (category) => category.id === moveCategoryId
                    )?.name ?? 'the selected category'
                  } > ${pendingMove?.subCategoryName ?? ''}`
                : ''}
              .
            </Alert>
          ) : null}
          <Select
            label="New category"
            placeholder="Select category"
            data={moveCategoryOptions}
            value={moveCategoryId}
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={setMoveCategoryId}
          />
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={moving}
              onClick={closeMove}
            >
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              loading={moving}
              disabled={!pendingMove || !moveCategoryId}
              onClick={async () => {
                if (!pendingMove || !moveCategoryId) return;
                try {
                  onClearMessages();
                  setMoving(true);
                  await taxonomy.moveSubCategory(
                    asSubCategoryId(pendingMove.subCategoryId),
                    asCategoryId(moveCategoryId)
                  );
                  const movedName = pendingMove.subCategoryName;
                  closeMove();
                  onStatus(`Moved subcategory "${movedName}".`);
                } catch (caught) {
                  onError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not move subcategory.'
                  );
                } finally {
                  setMoving(false);
                }
              }}
            >
              Move subcategory
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!pendingBulkRecode}
        onClose={closeBulkRecode}
        title="Recode transactions"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Recode all unlocked transactions using “
            {pendingBulkRecode?.subCategoryName ?? ''}” to another category and
            subcategory. The existing subcategory remains available.
          </Text>
          <Select
            label="Target category"
            data={categoryOptions}
            value={bulkRecodeCategoryId}
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              setSelectedBulkRecodeCategoryId(value);
              setBulkRecodeSubCategoryId(null);
            }}
          />
          <Select
            label="Target subcategory"
            placeholder={
              bulkRecodeSubCategoryOptions.length === 0
                ? 'No alternative subcategories'
                : 'Select subcategory'
            }
            data={bulkRecodeSubCategoryOptions}
            value={bulkRecodeSubCategoryId}
            disabled={
              !bulkRecodeCategoryId || bulkRecodeSubCategoryOptions.length === 0
            }
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={setBulkRecodeSubCategoryId}
          />
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={bulkRecode.isPending}
              onClick={closeBulkRecode}
            >
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              loading={bulkRecode.isPending}
              disabled={!pendingBulkRecode || !bulkRecodeSubCategoryId}
              onClick={async () => {
                if (!pendingBulkRecode || !bulkRecodeCategoryId) return;
                if (!bulkRecodeSubCategoryId) return;
                try {
                  onClearMessages();
                  const result = await bulkRecode.mutateAsync({
                    fromSubCategoryId: asSubCategoryId(
                      pendingBulkRecode.subCategoryId
                    ),
                    toCategoryId: asCategoryId(bulkRecodeCategoryId),
                    toSubCategoryId: asSubCategoryId(bulkRecodeSubCategoryId),
                  });
                  closeBulkRecode();
                  onStatus(
                    result.updatedCount === 0
                      ? 'No unlocked transactions needed recoding for that subcategory.'
                      : `Recoded ${result.updatedCount} transactions.`
                  );
                } catch (caught) {
                  onError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not recode transactions.'
                  );
                }
              }}
            >
              Recode transactions
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!pendingDelete}
        onClose={closeDelete}
        title={
          pendingDelete?.kind === 'category'
            ? 'Delete category?'
            : 'Delete subcategory?'
        }
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            {pendingDelete?.kind === 'category'
              ? `Deleting "${pendingDelete.name}" will remove its subcategories and uncode affected transactions and budgets.`
              : `Deleting "${pendingDelete?.name ?? ''}" will uncode affected transactions and budgets.`}
          </Text>
          {deleteAffectedRules.length > 0 ? (
            <Alert color="yellow" title="Auto-coding rules affected">
              {deleteAffectedRules.length}{' '}
              {deleteAffectedRules.length === 1
                ? 'rule targets'
                : 'rules target'}{' '}
              this {pendingDelete?.kind}. Matches:{' '}
              {deleteAffectedRules.map((rule) => rule.matchText).join(', ')}.
            </Alert>
          ) : null}
          {pendingDelete?.kind === 'subcategory' &&
          deleteAffectedRules.length > 0 ? (
            <>
              <Select
                label="Affected rule handling"
                data={[
                  {
                    value: 'reassign',
                    label: `Reassign ${deleteAffectedRules.length} ${
                      deleteAffectedRules.length === 1 ? 'rule' : 'rules'
                    } before deleting`,
                  },
                  {
                    value: 'delete',
                    label: `Delete ${deleteAffectedRules.length} ${
                      deleteAffectedRules.length === 1 ? 'rule' : 'rules'
                    } with the subcategory`,
                  },
                ]}
                value={deleteRuleHandling}
                allowDeselect={false}
                onChange={(value) => {
                  setSelectedDeleteRuleHandling(
                    value === 'reassign' ? 'reassign' : 'delete'
                  );
                  setDeleteReplacementCategoryId(null);
                  setDeleteReplacementSubCategoryId(null);
                }}
              />
              {deleteRuleHandling === 'reassign' ? (
                <Group grow align="flex-end" wrap="wrap">
                  <Select
                    label="Replacement category"
                    data={categoryOptions}
                    value={deleteReplacementCategoryId}
                    searchable
                    {...firefoxSafeModalSelectProps}
                    onChange={(value) => {
                      setDeleteReplacementCategoryId(value);
                      setDeleteReplacementSubCategoryId(null);
                    }}
                  />
                  <Select
                    label="Replacement subcategory"
                    placeholder={
                      deleteReplacementCategoryId
                        ? 'Select subcategory'
                        : 'Choose category first'
                    }
                    data={deleteReplacementSubCategoryOptions}
                    value={deleteReplacementSubCategoryId}
                    searchable
                    disabled={!deleteReplacementCategoryId}
                    {...firefoxSafeModalSelectProps}
                    onChange={setDeleteReplacementSubCategoryId}
                  />
                </Group>
              ) : null}
            </>
          ) : null}
          {pendingDelete?.kind === 'category' &&
          deleteAffectedRules.length > 0 ? (
            <Text size="sm" c="dimmed">
              Category deletion removes all affected rules. To preserve any of
              them, cancel and reassign those rules before deleting the
              category.
            </Text>
          ) : null}
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={deleting}
              onClick={closeDelete}
            >
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              loading={deleting}
              disabled={
                pendingDelete?.kind === 'subcategory' &&
                deleteAffectedRules.length > 0 &&
                deleteRuleHandling === 'reassign' &&
                !deleteReplacementSubCategoryId
              }
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  onClearMessages();
                  setDeleting(true);
                  if (pendingDelete.kind === 'category') {
                    await taxonomy.deleteCategory(
                      asCategoryId(pendingDelete.id)
                    );
                  } else {
                    await taxonomy.deleteSubCategory(
                      asSubCategoryId(pendingDelete.id),
                      deleteRuleHandling === 'reassign' &&
                        deleteReplacementSubCategoryId
                        ? asSubCategoryId(deleteReplacementSubCategoryId)
                        : undefined
                    );
                  }
                  closeDelete();
                } catch (caught) {
                  onError(
                    caught instanceof Error
                      ? caught.message
                      : `Could not delete ${pendingDelete.kind}.`
                  );
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

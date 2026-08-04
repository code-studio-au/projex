import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';

import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import { useProjectAutoCodingRulesQuery } from '../../queries/projectAutoCodingRules';
import { useBulkRecodeProjectTransactionsMutation } from '../../queries/taxonomy';
import classes from '../../styles/ui.module.css';
import { asCategoryId, asSubCategoryId } from '../../types/ids';
import ModalSelect from '../ModalSelect';
import type {
  TaxonomyDeleteTarget,
  TaxonomySubCategoryActionTarget,
} from './taxonomyActionTypes';
import {
  getTaxonomyDeleteAffectedSubCategoryIds,
  getTaxonomySubCategoryOptions,
  resolveTaxonomyDeleteRuleHandling,
} from './taxonomyActionModel';

function useTaxonomyActionDialogsController(props: {
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

  return {
    bulkRecode,
    bulkRecodeCategoryId,
    bulkRecodeSubCategoryId,
    bulkRecodeSubCategoryOptions,
    categoryOptions,
    closeBulkRecode,
    closeDelete,
    closeMove,
    deleteAffectedRules,
    deleteReplacementCategoryId,
    deleteReplacementSubCategoryId,
    deleteReplacementSubCategoryOptions,
    deleteRuleHandling,
    deleting,
    error,
    isMobile,
    moveAffectedRules,
    moveCategoryId,
    moveCategoryOptions,
    moving,
    onClearMessages,
    onError,
    onStatus,
    pendingBulkRecode,
    pendingDelete,
    pendingMove,
    setBulkRecodeSubCategoryId,
    setDeleteReplacementCategoryId,
    setDeleteReplacementSubCategoryId,
    setDeleting,
    setMoveCategoryId,
    setMoving,
    setSelectedBulkRecodeCategoryId,
    setSelectedDeleteRuleHandling,
    taxonomy,
  };
}

type TaxonomyActionDialogsController = ReturnType<
  typeof useTaxonomyActionDialogsController
>;

function MoveTaxonomyDialog({
  model,
}: {
  model: TaxonomyActionDialogsController;
}) {
  return (
    <Modal
      opened={!!model.pendingMove}
      onClose={model.closeMove}
      title="Move subcategory"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          Move “{model.pendingMove?.subCategoryName ?? ''}” to another category.
          Its budget line moves with it, and unlocked transactions using it will
          be updated to the new category.
        </Text>
        {model.moveAffectedRules.length > 0 ? (
          <Alert color="blue" title="Auto-coding impact">
            {model.moveAffectedRules.length}{' '}
            {model.moveAffectedRules.length === 1 ? 'rule' : 'rules'} targeting
            this exact subcategory ID will follow the move automatically
            {model.moveCategoryId
              ? ` to ${
                  model.taxonomy.categories.find(
                    (category) => category.id === model.moveCategoryId
                  )?.name ?? 'the selected category'
                } > ${model.pendingMove?.subCategoryName ?? ''}`
              : ''}
            .
          </Alert>
        ) : null}
        <ModalSelect
          label="New category"
          placeholder="Select category"
          data={model.moveCategoryOptions}
          value={model.moveCategoryId}
          searchable
          onChange={model.setMoveCategoryId}
        />
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.moving}
            onClick={model.closeMove}
          >
            Cancel
          </Button>
          <Button
            fullWidth={model.isMobile}
            loading={model.moving}
            disabled={!model.pendingMove || !model.moveCategoryId}
            onClick={async () => {
              if (!model.pendingMove || !model.moveCategoryId) return;
              try {
                model.onClearMessages();
                model.setMoving(true);
                await model.taxonomy.moveSubCategory(
                  asSubCategoryId(model.pendingMove.subCategoryId),
                  asCategoryId(model.moveCategoryId)
                );
                const movedName = model.pendingMove.subCategoryName;
                model.closeMove();
                model.onStatus(`Moved subcategory "${movedName}".`);
              } catch (caught) {
                model.onError(
                  caught instanceof Error
                    ? caught.message
                    : 'Could not move subcategory.'
                );
              } finally {
                model.setMoving(false);
              }
            }}
          >
            Move subcategory
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function BulkRecodeTaxonomyDialog({
  model,
}: {
  model: TaxonomyActionDialogsController;
}) {
  return (
    <Modal
      opened={!!model.pendingBulkRecode}
      onClose={model.closeBulkRecode}
      title="Recode transactions"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          Recode all unlocked transactions using “
          {model.pendingBulkRecode?.subCategoryName ?? ''}” to another category
          and subcategory. The existing subcategory remains available.
        </Text>
        <ModalSelect
          label="Target category"
          data={model.categoryOptions}
          value={model.bulkRecodeCategoryId}
          searchable
          onChange={(value) => {
            model.setSelectedBulkRecodeCategoryId(value);
            model.setBulkRecodeSubCategoryId(null);
          }}
        />
        <ModalSelect
          label="Target subcategory"
          placeholder={
            model.bulkRecodeSubCategoryOptions.length === 0
              ? 'No alternative subcategories'
              : 'Select subcategory'
          }
          data={model.bulkRecodeSubCategoryOptions}
          value={model.bulkRecodeSubCategoryId}
          disabled={
            !model.bulkRecodeCategoryId ||
            model.bulkRecodeSubCategoryOptions.length === 0
          }
          searchable
          onChange={model.setBulkRecodeSubCategoryId}
        />
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.bulkRecode.isPending}
            onClick={model.closeBulkRecode}
          >
            Cancel
          </Button>
          <Button
            fullWidth={model.isMobile}
            loading={model.bulkRecode.isPending}
            disabled={
              !model.pendingBulkRecode || !model.bulkRecodeSubCategoryId
            }
            onClick={async () => {
              if (!model.pendingBulkRecode || !model.bulkRecodeCategoryId)
                return;
              if (!model.bulkRecodeSubCategoryId) return;
              try {
                model.onClearMessages();
                const result = await model.bulkRecode.mutateAsync({
                  fromSubCategoryId: asSubCategoryId(
                    model.pendingBulkRecode.subCategoryId
                  ),
                  toCategoryId: asCategoryId(model.bulkRecodeCategoryId),
                  toSubCategoryId: asSubCategoryId(
                    model.bulkRecodeSubCategoryId
                  ),
                });
                model.closeBulkRecode();
                model.onStatus(
                  result.updatedCount === 0
                    ? 'No unlocked transactions needed recoding for that subcategory.'
                    : `Recoded ${result.updatedCount} transactions.`
                );
              } catch (caught) {
                model.onError(
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
  );
}

function DeleteTaxonomyDialog({
  model,
}: {
  model: TaxonomyActionDialogsController;
}) {
  return (
    <Modal
      opened={!!model.pendingDelete}
      onClose={model.closeDelete}
      title={
        model.pendingDelete?.kind === 'category'
          ? 'Delete category?'
          : 'Delete subcategory?'
      }
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          {model.pendingDelete?.kind === 'category'
            ? `Deleting "${model.pendingDelete.name}" will remove its subcategories and uncode affected transactions and budgets.`
            : `Deleting "${model.pendingDelete?.name ?? ''}" will uncode affected transactions and budgets.`}
        </Text>
        {model.deleteAffectedRules.length > 0 ? (
          <Alert color="yellow" title="Auto-coding rules affected">
            {model.deleteAffectedRules.length}{' '}
            {model.deleteAffectedRules.length === 1
              ? 'rule targets'
              : 'rules target'}{' '}
            this {model.pendingDelete?.kind}. Matches:{' '}
            {model.deleteAffectedRules.map((rule) => rule.matchText).join(', ')}
            .
          </Alert>
        ) : null}
        {model.pendingDelete?.kind === 'subcategory' &&
        model.deleteAffectedRules.length > 0 ? (
          <>
            <ModalSelect
              label="Affected rule handling"
              data={[
                {
                  value: 'reassign',
                  label: `Reassign ${model.deleteAffectedRules.length} ${
                    model.deleteAffectedRules.length === 1 ? 'rule' : 'rules'
                  } before deleting`,
                },
                {
                  value: 'delete',
                  label: `Delete ${model.deleteAffectedRules.length} ${
                    model.deleteAffectedRules.length === 1 ? 'rule' : 'rules'
                  } with the subcategory`,
                },
              ]}
              value={model.deleteRuleHandling}
              allowDeselect={false}
              onChange={(value) => {
                model.setSelectedDeleteRuleHandling(
                  value === 'reassign' ? 'reassign' : 'delete'
                );
                model.setDeleteReplacementCategoryId(null);
                model.setDeleteReplacementSubCategoryId(null);
              }}
            />
            {model.deleteRuleHandling === 'reassign' ? (
              <Group grow align="flex-end" wrap="wrap">
                <ModalSelect
                  label="Replacement category"
                  data={model.categoryOptions}
                  value={model.deleteReplacementCategoryId}
                  searchable
                  onChange={(value) => {
                    model.setDeleteReplacementCategoryId(value);
                    model.setDeleteReplacementSubCategoryId(null);
                  }}
                />
                <ModalSelect
                  label="Replacement subcategory"
                  placeholder={
                    model.deleteReplacementCategoryId
                      ? 'Select subcategory'
                      : 'Choose category first'
                  }
                  data={model.deleteReplacementSubCategoryOptions}
                  value={model.deleteReplacementSubCategoryId}
                  searchable
                  disabled={!model.deleteReplacementCategoryId}
                  onChange={model.setDeleteReplacementSubCategoryId}
                />
              </Group>
            ) : null}
          </>
        ) : null}
        {model.pendingDelete?.kind === 'category' &&
        model.deleteAffectedRules.length > 0 ? (
          <Text size="sm" c="dimmed">
            Category deletion removes all affected rules. To preserve any of
            them, cancel and reassign those rules before deleting the category.
          </Text>
        ) : null}
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.deleting}
            onClick={model.closeDelete}
          >
            Cancel
          </Button>
          <Button
            color="red"
            fullWidth={model.isMobile}
            loading={model.deleting}
            disabled={
              model.pendingDelete?.kind === 'subcategory' &&
              model.deleteAffectedRules.length > 0 &&
              model.deleteRuleHandling === 'reassign' &&
              !model.deleteReplacementSubCategoryId
            }
            onClick={async () => {
              if (!model.pendingDelete) return;
              try {
                model.onClearMessages();
                model.setDeleting(true);
                if (model.pendingDelete.kind === 'category') {
                  await model.taxonomy.deleteCategory(
                    asCategoryId(model.pendingDelete.id)
                  );
                } else {
                  await model.taxonomy.deleteSubCategory(
                    asSubCategoryId(model.pendingDelete.id),
                    model.deleteRuleHandling === 'reassign' &&
                      model.deleteReplacementSubCategoryId
                      ? asSubCategoryId(model.deleteReplacementSubCategoryId)
                      : undefined
                  );
                }
                model.closeDelete();
              } catch (caught) {
                model.onError(
                  caught instanceof Error
                    ? caught.message
                    : `Could not delete ${model.pendingDelete.kind}.`
                );
              } finally {
                model.setDeleting(false);
              }
            }}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TaxonomyActionDialogsView({
  model,
}: {
  model: TaxonomyActionDialogsController;
}) {
  return (
    <>
      <MoveTaxonomyDialog model={model} />

      <BulkRecodeTaxonomyDialog model={model} />

      <DeleteTaxonomyDialog model={model} />
    </>
  );
}

export default function TaxonomyActionDialogs(
  props: Parameters<typeof useTaxonomyActionDialogsController>[0]
) {
  const model = useTaxonomyActionDialogsController(props);
  return <TaxonomyActionDialogsView model={model} />;
}

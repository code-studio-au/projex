import { useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import {
  useCompanyDefaultsQuery,
  useCreateCompanyDefaultCategoryMutation,
  useCreateCompanyDefaultSubCategoryMutation,
  useDeleteCompanyDefaultCategoryMutation,
  useDeleteCompanyDefaultSubCategoryMutation,
  useUpdateCompanyDefaultCategoryMutation,
  useUpdateCompanyDefaultSubCategoryMutation,
} from '../queries/taxonomy';
import classes from '../styles/ui.module.css';
import type { CompanyId } from '../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../types';
import {
  ManagementActionsMenu,
  ManagementModalIntro,
} from './ManagementModalUi';
import ModalSelect from './ModalSelect';

type TaxonomyTarget = {
  kind: 'category' | 'subcategory';
  id: string;
  name: string;
};

type PendingMove = {
  id: string;
  name: string;
  currentCategoryId: string;
};

function useCompanyDefaultTaxonomyModalController(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const createCategory = useCreateCompanyDefaultCategoryMutation(companyId);
  const updateCategory = useUpdateCompanyDefaultCategoryMutation(companyId);
  const deleteCategory = useDeleteCompanyDefaultCategoryMutation(companyId);
  const createSubCategory =
    useCreateCompanyDefaultSubCategoryMutation(companyId);
  const updateSubCategory =
    useUpdateCompanyDefaultSubCategoryMutation(companyId);
  const deleteSubCategory =
    useDeleteCompanyDefaultSubCategoryMutation(companyId);

  const categories = useMemo(
    () => companyDefaultsQ.data?.categories ?? [],
    [companyDefaultsQ.data]
  );
  const subCategories = useMemo(
    () => companyDefaultsQ.data?.subCategories ?? [],
    [companyDefaultsQ.data]
  );
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories]
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<'category' | 'subcategory'>(
    'subcategory'
  );
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newSubCategoryCategoryId, setNewSubCategoryCategoryId] = useState<
    string | null
  >(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [renameTarget, setRenameTarget] = useState<TaxonomyTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveCategoryId, setMoveCategoryId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaxonomyTarget | null>(
    null
  );
  const [deleteRuleHandling, setDeleteRuleHandling] = useState<
    'delete' | 'reassign'
  >('delete');
  const [deleteReplacementCategoryId, setDeleteReplacementCategoryId] =
    useState<string | null>(null);
  const [deleteReplacementSubCategoryId, setDeleteReplacementSubCategoryId] =
    useState<string | null>(null);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const showSearch =
    categories.length > 10 ||
    subCategories.length > 30 ||
    normalizedSearch.length > 0;
  const visibleCategories = normalizedSearch
    ? categories.filter((category) => {
        if (category.name.toLocaleLowerCase().includes(normalizedSearch)) {
          return true;
        }
        return subCategories.some(
          (subCategory) =>
            subCategory.companyDefaultCategoryId === category.id &&
            subCategory.name.toLocaleLowerCase().includes(normalizedSearch)
        );
      })
    : categories;
  const accordionValue = normalizedSearch
    ? visibleCategories.map((category) => category.id)
    : expandedCategoryIds;
  const moveCategoryOptions = categoryOptions.filter(
    (option) => option.value !== pendingMove?.currentCategoryId
  );
  const autoCodingRules = companyDefaultsQ.data?.mappingRules ?? [];
  const moveAffectedRules = pendingMove
    ? autoCodingRules.filter(
        (rule) => rule.companyDefaultSubCategoryId === pendingMove.id
      )
    : [];
  const deleteAffectedSubCategoryIds = new Set(
    pendingDelete?.kind === 'category'
      ? subCategories.flatMap((subCategory) =>
          subCategory.companyDefaultCategoryId === pendingDelete.id
            ? [subCategory.id]
            : []
        )
      : pendingDelete?.kind === 'subcategory'
        ? [pendingDelete.id]
        : []
  );
  const deleteAffectedRules = autoCodingRules.filter((rule) =>
    deleteAffectedSubCategoryIds.has(rule.companyDefaultSubCategoryId)
  );
  const deleteReplacementSubCategoryOptions = subCategories.flatMap(
    (subCategory) =>
      subCategory.companyDefaultCategoryId === deleteReplacementCategoryId &&
      !deleteAffectedSubCategoryIds.has(subCategory.id)
        ? [
            {
              value: subCategory.id,
              label: subCategory.name,
            },
          ]
        : []
  );
  const creating = createCategory.isPending || createSubCategory.isPending;
  const renaming = updateCategory.isPending || updateSubCategory.isPending;
  const deleting = deleteCategory.isPending || deleteSubCategory.isPending;

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  function beginDelete(target: TaxonomyTarget) {
    clearFeedback();
    setPendingDelete(target);
    setDeleteRuleHandling(
      target.kind === 'subcategory' &&
        autoCodingRules.some(
          (rule) => rule.companyDefaultSubCategoryId === target.id
        )
        ? 'reassign'
        : 'delete'
    );
    setDeleteReplacementCategoryId(null);
    setDeleteReplacementSubCategoryId(null);
  }

  function closeDelete() {
    setPendingDelete(null);
    setDeleteRuleHandling('delete');
    setDeleteReplacementCategoryId(null);
    setDeleteReplacementSubCategoryId(null);
  }

  function beginRename(target: TaxonomyTarget) {
    clearFeedback();
    setRenameTarget(target);
    setRenameDraft(target.name);
  }

  function cancelRename() {
    setRenameTarget(null);
    setRenameDraft('');
    setError(null);
  }

  async function saveRename() {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) {
      setError(
        renameTarget.kind === 'category'
          ? 'Category name is required.'
          : 'Subcategory name is required.'
      );
      return;
    }
    if (name === renameTarget.name.trim()) {
      cancelRename();
      return;
    }

    try {
      clearFeedback();
      if (renameTarget.kind === 'category') {
        await updateCategory.mutateAsync({
          id: asCompanyDefaultCategoryId(renameTarget.id),
          name,
        });
      } else {
        await updateSubCategory.mutateAsync({
          id: asCompanyDefaultSubCategoryId(renameTarget.id),
          name,
        });
      }
      setRenameTarget(null);
      setRenameDraft('');
      setSuccess(`Renamed company ${renameTarget.kind}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not rename company ${renameTarget.kind}.`
      );
    }
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      clearFeedback();
      const created = await createCategory.mutateAsync({ companyId, name });
      setNewCategoryName('');
      setNewSubCategoryCategoryId(created.id);
      setCreationMode('subcategory');
      setSuccess(`Added company category "${name}".`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not add company category.'
      );
    }
  }

  async function addSubCategory() {
    const name = newSubCategoryName.trim();
    if (!name || !newSubCategoryCategoryId) return;
    try {
      clearFeedback();
      await createSubCategory.mutateAsync({
        companyId,
        companyDefaultCategoryId: asCompanyDefaultCategoryId(
          newSubCategoryCategoryId
        ),
        name,
      });
      setNewSubCategoryName('');
      setExpandedCategoryIds((current) =>
        current.includes(newSubCategoryCategoryId)
          ? current
          : [...current, newSubCategoryCategoryId]
      );
      setSuccess(`Added company subcategory "${name}".`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not add company subcategory.'
      );
    }
  }

  function closeManager() {
    clearFeedback();
    setRenameTarget(null);
    setRenameDraft('');
    setSearch('');
    onClose();
  }

  return {
    accordionValue,
    addCategory,
    addSubCategory,
    beginDelete,
    beginRename,
    cancelRename,
    categories,
    categoryOptions,
    clearFeedback,
    closeDelete,
    closeManager,
    companyDefaultsQ,
    creating,
    creationMode,
    deleteAffectedRules,
    deleteCategory,
    deleteReplacementCategoryId,
    deleteReplacementSubCategoryId,
    deleteReplacementSubCategoryOptions,
    deleteRuleHandling,
    deleteSubCategory,
    deleting,
    error,
    isMobile,
    moveAffectedRules,
    moveCategoryId,
    moveCategoryOptions,
    newCategoryName,
    newSubCategoryCategoryId,
    newSubCategoryName,
    normalizedSearch,
    onClose,
    opened,
    pendingDelete,
    pendingMove,
    readOnly,
    renameDraft,
    renameTarget,
    renaming,
    saveRename,
    search,
    setCreationMode,
    setDeleteReplacementCategoryId,
    setDeleteReplacementSubCategoryId,
    setDeleteRuleHandling,
    setError,
    setExpandedCategoryIds,
    setMoveCategoryId,
    setNewCategoryName,
    setNewSubCategoryCategoryId,
    setNewSubCategoryName,
    setPendingMove,
    setRenameDraft,
    setSearch,
    setSuccess,
    showSearch,
    subCategories,
    success,
    updateSubCategory,
    visibleCategories,
  };
}

type CompanyDefaultTaxonomyModalController = ReturnType<
  typeof useCompanyDefaultTaxonomyModalController
>;

function CompanyDefaultTaxonomyComposer({
  model,
}: {
  model: CompanyDefaultTaxonomyModalController;
}) {
  return (
    <Paper withBorder radius="md" p="md" className={classes.taxonomyCreateCard}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={2}>
            <Text fw={600}>
              {model.creationMode === 'subcategory'
                ? 'Add company subcategory'
                : 'Add company category'}
            </Text>
            <Text size="sm" c="dimmed">
              {model.creationMode === 'subcategory'
                ? 'Create a standard coding option under an existing company category.'
                : 'Create a new top-level category for linked projects.'}
            </Text>
          </Stack>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => {
              model.clearFeedback();
              model.setCreationMode((current) =>
                current === 'subcategory' ? 'category' : 'subcategory'
              );
            }}
          >
            {model.creationMode === 'subcategory'
              ? 'Add category instead'
              : 'Add subcategory instead'}
          </Button>
        </Group>

        {model.creationMode === 'subcategory' ? (
          <Group align="flex-end" wrap="wrap">
            <ModalSelect
              label="Company category"
              placeholder={
                model.categoryOptions.length === 0
                  ? 'Add a category first'
                  : 'Select category'
              }
              data={model.categoryOptions}
              value={model.newSubCategoryCategoryId}
              searchable
              disabled={model.categoryOptions.length === 0}
              onChange={(value) => {
                model.clearFeedback();
                model.setNewSubCategoryCategoryId(value);
              }}
              className={classes.fieldGrow}
            />
            <TextInput
              label="Subcategory name"
              placeholder="e.g. Flights"
              value={model.newSubCategoryName}
              disabled={model.categoryOptions.length === 0}
              onChange={(event) => {
                model.clearFeedback();
                model.setNewSubCategoryName(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void model.addSubCategory();
                }
              }}
              className={classes.fieldGrow}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              loading={model.creating}
              disabled={
                !model.newSubCategoryCategoryId ||
                !model.newSubCategoryName.trim() ||
                model.categoryOptions.length === 0
              }
              fullWidth={model.isMobile}
              onClick={() => void model.addSubCategory()}
            >
              Add subcategory
            </Button>
          </Group>
        ) : (
          <Group align="flex-end" wrap="wrap">
            <TextInput
              label="Category name"
              placeholder="e.g. Travel"
              value={model.newCategoryName}
              onChange={(event) => {
                model.clearFeedback();
                model.setNewCategoryName(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void model.addCategory();
                }
              }}
              className={classes.fieldGrow}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              loading={model.creating}
              disabled={!model.newCategoryName.trim()}
              fullWidth={model.isMobile}
              onClick={() => void model.addCategory()}
            >
              Add category
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

function CompanyDefaultTaxonomyList({
  model,
}: {
  model: CompanyDefaultTaxonomyModalController;
}) {
  return (
    <Accordion
      multiple
      variant="separated"
      radius="md"
      value={model.accordionValue}
      onChange={model.setExpandedCategoryIds}
      classNames={{ item: classes.taxonomyAccordionItem }}
    >
      {model.visibleCategories.map((category) => {
        const allSubCategories = model.subCategories.filter(
          (subCategory) => subCategory.companyDefaultCategoryId === category.id
        );
        const categoryMatches = category.name
          .toLocaleLowerCase()
          .includes(model.normalizedSearch);
        const visibleSubCategories =
          model.normalizedSearch && !categoryMatches
            ? allSubCategories.filter((subCategory) =>
                subCategory.name
                  .toLocaleLowerCase()
                  .includes(model.normalizedSearch)
              )
            : allSubCategories;
        const renamingCategory =
          model.renameTarget?.kind === 'category' &&
          model.renameTarget.id === category.id;

        return (
          <Accordion.Item key={category.id} value={category.id}>
            {renamingCategory ? (
              <Group p="sm" align="flex-end" wrap="wrap">
                <TextInput
                  label="Rename company category"
                  value={model.renameDraft}
                  autoFocus
                  disabled={model.renaming}
                  onChange={(event) => {
                    model.setError(null);
                    model.setRenameDraft(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void model.saveRename();
                    }
                    if (event.key === 'Escape') model.cancelRename();
                  }}
                  className={classes.fieldGrow}
                />
                <Button
                  size="compact-sm"
                  loading={model.renaming}
                  disabled={!model.renameDraft.trim()}
                  onClick={() => void model.saveRename()}
                >
                  Save
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  disabled={model.renaming}
                  onClick={model.cancelRename}
                >
                  Cancel
                </Button>
              </Group>
            ) : (
              <Group gap={0} wrap="nowrap" pr="xs">
                <Accordion.Control className={classes.taxonomyAccordionControl}>
                  <Stack gap={3}>
                    <Text fw={600}>{category.name}</Text>
                    <Text size="xs" c="dimmed">
                      {allSubCategories.length}{' '}
                      {allSubCategories.length === 1
                        ? 'subcategory'
                        : 'subcategories'}
                    </Text>
                  </Stack>
                </Accordion.Control>
                {!model.readOnly ? (
                  <ManagementActionsMenu
                    label={`Actions for company category ${category.name}`}
                  >
                    <Menu.Item
                      onClick={() =>
                        model.beginRename({
                          kind: 'category',
                          id: category.id,
                          name: category.name,
                        })
                      }
                    >
                      Rename category
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={15} />}
                      onClick={() => {
                        model.beginDelete({
                          kind: 'category',
                          id: category.id,
                          name: category.name,
                        });
                      }}
                    >
                      Delete category
                    </Menu.Item>
                  </ManagementActionsMenu>
                ) : null}
              </Group>
            )}

            <Accordion.Panel>
              {visibleSubCategories.length === 0 ? (
                <Text className={classes.emptyState}>
                  No subcategories yet.
                </Text>
              ) : (
                <Stack gap="xs">
                  {visibleSubCategories.map((subCategory) => {
                    const renamingSubCategory =
                      model.renameTarget?.kind === 'subcategory' &&
                      model.renameTarget.id === subCategory.id;
                    return (
                      <Paper
                        key={subCategory.id}
                        withBorder
                        radius="md"
                        p="sm"
                        className={classes.taxonomySubCategoryRow}
                      >
                        {renamingSubCategory ? (
                          <Group align="flex-end" wrap="wrap">
                            <TextInput
                              label="Rename company subcategory"
                              value={model.renameDraft}
                              autoFocus
                              disabled={model.renaming}
                              onChange={(event) => {
                                model.setError(null);
                                model.setRenameDraft(event.currentTarget.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void model.saveRename();
                                }
                                if (event.key === 'Escape') {
                                  model.cancelRename();
                                }
                              }}
                              className={classes.fieldGrow}
                            />
                            <Button
                              size="compact-sm"
                              loading={model.renaming}
                              disabled={!model.renameDraft.trim()}
                              onClick={() => void model.saveRename()}
                            >
                              Save
                            </Button>
                            <Button
                              size="compact-sm"
                              variant="default"
                              disabled={model.renaming}
                              onClick={model.cancelRename}
                            >
                              Cancel
                            </Button>
                          </Group>
                        ) : (
                          <Group
                            justify="space-between"
                            align="center"
                            wrap="nowrap"
                          >
                            <Text fw={500}>{subCategory.name}</Text>
                            {!model.readOnly ? (
                              <ManagementActionsMenu
                                label={`Actions for company subcategory ${subCategory.name}`}
                              >
                                <Menu.Item
                                  onClick={() =>
                                    model.beginRename({
                                      kind: 'subcategory',
                                      id: subCategory.id,
                                      name: subCategory.name,
                                    })
                                  }
                                >
                                  Rename subcategory
                                </Menu.Item>
                                <Menu.Item
                                  disabled={model.categoryOptions.length < 2}
                                  onClick={() => {
                                    model.clearFeedback();
                                    model.setPendingMove({
                                      id: subCategory.id,
                                      name: subCategory.name,
                                      currentCategoryId:
                                        subCategory.companyDefaultCategoryId,
                                    });
                                    model.setMoveCategoryId(null);
                                  }}
                                >
                                  Move to another category…
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                  color="red"
                                  leftSection={<IconTrash size={15} />}
                                  onClick={() => {
                                    model.beginDelete({
                                      kind: 'subcategory',
                                      id: subCategory.id,
                                      name: subCategory.name,
                                    });
                                  }}
                                >
                                  Delete subcategory
                                </Menu.Item>
                              </ManagementActionsMenu>
                            ) : null}
                          </Group>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}

function MoveCompanyDefaultTaxonomyModal({
  model,
}: {
  model: CompanyDefaultTaxonomyModalController;
}) {
  return (
    <Modal
      opened={!!model.pendingMove}
      onClose={() => {
        model.setPendingMove(null);
        model.setMoveCategoryId(null);
      }}
      title="Move company subcategory"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          Move “{model.pendingMove?.name ?? ''}” to another company category.
          Linked projects refresh inherited items automatically; project
          overrides remain unchanged.
        </Text>
        {model.moveAffectedRules.length > 0 ? (
          <Alert color="blue" title="Auto-coding impact">
            {model.moveAffectedRules.length}{' '}
            {model.moveAffectedRules.length === 1
              ? 'company rule'
              : 'company rules'}{' '}
            targeting this exact subcategory ID will follow the move
            automatically
            {model.moveCategoryId
              ? ` to ${
                  model.categories.find(
                    (category) => category.id === model.moveCategoryId
                  )?.name ?? 'the selected category'
                } > ${model.pendingMove?.name ?? ''}`
              : ''}
            . Inherited project copies will refresh to the same target unless
            their taxonomy placement is overridden locally.
          </Alert>
        ) : null}
        <ModalSelect
          label="New company category"
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
            disabled={model.updateSubCategory.isPending}
            onClick={() => {
              model.setPendingMove(null);
              model.setMoveCategoryId(null);
            }}
          >
            Cancel
          </Button>
          <Button
            fullWidth={model.isMobile}
            loading={model.updateSubCategory.isPending}
            disabled={!model.pendingMove || !model.moveCategoryId}
            onClick={async () => {
              if (!model.pendingMove || !model.moveCategoryId) return;
              try {
                model.clearFeedback();
                await model.updateSubCategory.mutateAsync({
                  id: asCompanyDefaultSubCategoryId(model.pendingMove.id),
                  companyDefaultCategoryId: asCompanyDefaultCategoryId(
                    model.moveCategoryId
                  ),
                });
                const movedName = model.pendingMove.name;
                model.setPendingMove(null);
                model.setMoveCategoryId(null);
                model.setSuccess(`Moved company subcategory "${movedName}".`);
              } catch (err) {
                model.setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not move company subcategory.'
                );
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

function DeleteCompanyDefaultTaxonomyModal({
  model,
}: {
  model: CompanyDefaultTaxonomyModalController;
}) {
  return (
    <Modal
      opened={!!model.pendingDelete}
      onClose={model.closeDelete}
      title={
        model.pendingDelete?.kind === 'category'
          ? 'Delete company category?'
          : 'Delete company subcategory?'
      }
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          {model.pendingDelete?.kind === 'category'
            ? `Delete "${model.pendingDelete.name}" and all of its company subcategories? Linked project items are detached rather than deleting existing project coding data.`
            : `Delete "${model.pendingDelete?.name ?? ''}" from the company categories? Linked project items are detached rather than deleting existing project coding data.`}
        </Text>
        {model.deleteAffectedRules.length > 0 ? (
          <Alert color="yellow" title="Auto-coding rules affected">
            {model.deleteAffectedRules.length}{' '}
            {model.deleteAffectedRules.length === 1
              ? 'company rule targets'
              : 'company rules target'}{' '}
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
                model.setDeleteRuleHandling(
                  value === 'reassign' ? 'reassign' : 'delete'
                );
                model.setDeleteReplacementCategoryId(null);
                model.setDeleteReplacementSubCategoryId(null);
              }}
            />
            {model.deleteRuleHandling === 'reassign' ? (
              <Group grow align="flex-end" wrap="wrap">
                <ModalSelect
                  label="Replacement company category"
                  data={model.categoryOptions}
                  value={model.deleteReplacementCategoryId}
                  searchable
                  onChange={(value) => {
                    model.setDeleteReplacementCategoryId(value);
                    model.setDeleteReplacementSubCategoryId(null);
                  }}
                />
                <ModalSelect
                  label="Replacement company subcategory"
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
            Category deletion removes these company rules. Existing linked
            project copies become detached local rules. To preserve the company
            rules, cancel and reassign them before deleting the category.
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
                model.clearFeedback();
                if (model.pendingDelete.kind === 'category') {
                  await model.deleteCategory.mutateAsync(
                    asCompanyDefaultCategoryId(model.pendingDelete.id)
                  );
                } else {
                  await model.deleteSubCategory.mutateAsync({
                    subCategoryId: asCompanyDefaultSubCategoryId(
                      model.pendingDelete.id
                    ),
                    ...(model.deleteRuleHandling === 'reassign' &&
                    model.deleteReplacementSubCategoryId
                      ? {
                          replacementSubCategoryId:
                            asCompanyDefaultSubCategoryId(
                              model.deleteReplacementSubCategoryId
                            ),
                        }
                      : {}),
                  });
                }
                model.closeDelete();
                model.setSuccess(
                  `Deleted company ${model.pendingDelete.kind}.`
                );
              } catch (err) {
                model.setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not delete company category item.'
                );
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

function CompanyDefaultTaxonomyModalView({
  model,
}: {
  model: CompanyDefaultTaxonomyModalController;
}) {
  return (
    <>
      <Modal
        opened={model.opened}
        onClose={model.closeManager}
        title="Manage company categories"
        fullScreen={model.isMobile}
        centered={!model.isMobile}
        size="lg"
        styles={{
          body: {
            maxHeight: model.isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md" className={classes.modalStack}>
          {model.error ? <Alert color="red">{model.error}</Alert> : null}
          {model.success ? (
            <Alert
              color="green"
              withCloseButton
              onClose={() => model.setSuccess(null)}
            >
              {model.success}
            </Alert>
          ) : null}
          {model.readOnly ? (
            <Alert color="blue">
              You can view company categories, but you do not have permission to
              change them.
            </Alert>
          ) : null}

          <ManagementModalIntro title="Company category standards">
            These categories provide the standard coding structure for linked
            projects. Changes refresh inherited project items automatically,
            while project-specific overrides remain local.
          </ManagementModalIntro>

          {!model.readOnly ? (
            <CompanyDefaultTaxonomyComposer model={model} />
          ) : null}

          {model.showSearch ? (
            <TextInput
              label="Search categories"
              placeholder="Search categories or subcategories"
              value={model.search}
              onChange={(event) => model.setSearch(event.currentTarget.value)}
            />
          ) : null}

          {model.companyDefaultsQ.isPending && !model.companyDefaultsQ.data ? (
            <Text className={classes.emptyState}>
              Loading company categories…
            </Text>
          ) : model.categories.length === 0 ? (
            <Text className={classes.emptyState}>
              No company categories yet. Add a category before creating
              subcategories.
            </Text>
          ) : model.visibleCategories.length === 0 ? (
            <Text className={classes.emptyState}>
              No categories or subcategories match “{model.search.trim()}”.
            </Text>
          ) : (
            <CompanyDefaultTaxonomyList model={model} />
          )}
        </Stack>
      </Modal>

      <MoveCompanyDefaultTaxonomyModal model={model} />

      <DeleteCompanyDefaultTaxonomyModal model={model} />
    </>
  );
}

export default function CompanyDefaultTaxonomyModal(
  props: Parameters<typeof useCompanyDefaultTaxonomyModalController>[0]
) {
  const model = useCompanyDefaultTaxonomyModalController(props);
  return <CompanyDefaultTaxonomyModalView model={model} />;
}

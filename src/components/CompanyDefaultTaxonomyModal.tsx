import { useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
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
import { firefoxSafeModalSelectProps } from './modalSelectProps';

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

export default function CompanyDefaultTaxonomyModal(props: {
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
      ? subCategories
          .filter(
            (subCategory) =>
              subCategory.companyDefaultCategoryId === pendingDelete.id
          )
          .map((subCategory) => subCategory.id)
      : pendingDelete?.kind === 'subcategory'
        ? [pendingDelete.id]
        : []
  );
  const deleteAffectedRules = autoCodingRules.filter((rule) =>
    deleteAffectedSubCategoryIds.has(rule.companyDefaultSubCategoryId)
  );
  const deleteReplacementSubCategoryOptions = subCategories
    .filter(
      (subCategory) =>
        subCategory.companyDefaultCategoryId === deleteReplacementCategoryId &&
        !deleteAffectedSubCategoryIds.has(subCategory.id)
    )
    .map((subCategory) => ({
      value: subCategory.id,
      label: subCategory.name,
    }));
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

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeManager}
        title="Manage company categories"
        fullScreen={isMobile}
        centered={!isMobile}
        size="lg"
        lockScroll={false}
        styles={{
          body: {
            maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md" className={classes.modalStack}>
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? (
            <Alert
              color="green"
              withCloseButton
              onClose={() => setSuccess(null)}
            >
              {success}
            </Alert>
          ) : null}
          {readOnly ? (
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

          {!readOnly ? (
            <Paper
              withBorder
              radius="md"
              p="md"
              className={classes.taxonomyCreateCard}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={2}>
                    <Text fw={600}>
                      {creationMode === 'subcategory'
                        ? 'Add company subcategory'
                        : 'Add company category'}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {creationMode === 'subcategory'
                        ? 'Create a standard coding option under an existing company category.'
                        : 'Create a new top-level category for linked projects.'}
                    </Text>
                  </Stack>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => {
                      clearFeedback();
                      setCreationMode((current) =>
                        current === 'subcategory' ? 'category' : 'subcategory'
                      );
                    }}
                  >
                    {creationMode === 'subcategory'
                      ? 'Add category instead'
                      : 'Add subcategory instead'}
                  </Button>
                </Group>

                {creationMode === 'subcategory' ? (
                  <Group align="flex-end" wrap="wrap">
                    <Select
                      label="Company category"
                      placeholder={
                        categoryOptions.length === 0
                          ? 'Add a category first'
                          : 'Select category'
                      }
                      data={categoryOptions}
                      value={newSubCategoryCategoryId}
                      searchable
                      disabled={categoryOptions.length === 0}
                      {...firefoxSafeModalSelectProps}
                      onChange={(value) => {
                        clearFeedback();
                        setNewSubCategoryCategoryId(value);
                      }}
                      className={classes.fieldGrow}
                    />
                    <TextInput
                      label="Subcategory name"
                      placeholder="e.g. Flights"
                      value={newSubCategoryName}
                      disabled={categoryOptions.length === 0}
                      onChange={(event) => {
                        clearFeedback();
                        setNewSubCategoryName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addSubCategory();
                        }
                      }}
                      className={classes.fieldGrow}
                    />
                    <Button
                      leftSection={<IconPlus size={16} />}
                      loading={creating}
                      disabled={
                        !newSubCategoryCategoryId ||
                        !newSubCategoryName.trim() ||
                        categoryOptions.length === 0
                      }
                      fullWidth={isMobile}
                      onClick={() => void addSubCategory()}
                    >
                      Add subcategory
                    </Button>
                  </Group>
                ) : (
                  <Group align="flex-end" wrap="wrap">
                    <TextInput
                      label="Category name"
                      placeholder="e.g. Travel"
                      value={newCategoryName}
                      onChange={(event) => {
                        clearFeedback();
                        setNewCategoryName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addCategory();
                        }
                      }}
                      className={classes.fieldGrow}
                    />
                    <Button
                      leftSection={<IconPlus size={16} />}
                      loading={creating}
                      disabled={!newCategoryName.trim()}
                      fullWidth={isMobile}
                      onClick={() => void addCategory()}
                    >
                      Add category
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          ) : null}

          {showSearch ? (
            <TextInput
              label="Search categories"
              placeholder="Search categories or subcategories"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          ) : null}

          {companyDefaultsQ.isPending && !companyDefaultsQ.data ? (
            <Text className={classes.emptyState}>
              Loading company categories…
            </Text>
          ) : categories.length === 0 ? (
            <Text className={classes.emptyState}>
              No company categories yet. Add a category before creating
              subcategories.
            </Text>
          ) : visibleCategories.length === 0 ? (
            <Text className={classes.emptyState}>
              No categories or subcategories match “{search.trim()}”.
            </Text>
          ) : (
            <Accordion
              multiple
              variant="separated"
              radius="md"
              value={accordionValue}
              onChange={setExpandedCategoryIds}
              classNames={{ item: classes.taxonomyAccordionItem }}
            >
              {visibleCategories.map((category) => {
                const allSubCategories = subCategories.filter(
                  (subCategory) =>
                    subCategory.companyDefaultCategoryId === category.id
                );
                const categoryMatches = category.name
                  .toLocaleLowerCase()
                  .includes(normalizedSearch);
                const visibleSubCategories =
                  normalizedSearch && !categoryMatches
                    ? allSubCategories.filter((subCategory) =>
                        subCategory.name
                          .toLocaleLowerCase()
                          .includes(normalizedSearch)
                      )
                    : allSubCategories;
                const renamingCategory =
                  renameTarget?.kind === 'category' &&
                  renameTarget.id === category.id;

                return (
                  <Accordion.Item key={category.id} value={category.id}>
                    {renamingCategory ? (
                      <Group p="sm" align="flex-end" wrap="wrap">
                        <TextInput
                          label="Rename company category"
                          value={renameDraft}
                          autoFocus
                          disabled={renaming}
                          onChange={(event) => {
                            setError(null);
                            setRenameDraft(event.currentTarget.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void saveRename();
                            }
                            if (event.key === 'Escape') cancelRename();
                          }}
                          className={classes.fieldGrow}
                        />
                        <Button
                          size="compact-sm"
                          loading={renaming}
                          disabled={!renameDraft.trim()}
                          onClick={() => void saveRename()}
                        >
                          Save
                        </Button>
                        <Button
                          size="compact-sm"
                          variant="default"
                          disabled={renaming}
                          onClick={cancelRename}
                        >
                          Cancel
                        </Button>
                      </Group>
                    ) : (
                      <Group gap={0} wrap="nowrap" pr="xs">
                        <Accordion.Control
                          className={classes.taxonomyAccordionControl}
                        >
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
                        {!readOnly ? (
                          <ManagementActionsMenu
                            label={`Actions for company category ${category.name}`}
                          >
                            <Menu.Item
                              onClick={() =>
                                beginRename({
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
                                beginDelete({
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
                              renameTarget?.kind === 'subcategory' &&
                              renameTarget.id === subCategory.id;
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
                                      value={renameDraft}
                                      autoFocus
                                      disabled={renaming}
                                      onChange={(event) => {
                                        setError(null);
                                        setRenameDraft(
                                          event.currentTarget.value
                                        );
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          void saveRename();
                                        }
                                        if (event.key === 'Escape') {
                                          cancelRename();
                                        }
                                      }}
                                      className={classes.fieldGrow}
                                    />
                                    <Button
                                      size="compact-sm"
                                      loading={renaming}
                                      disabled={!renameDraft.trim()}
                                      onClick={() => void saveRename()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="compact-sm"
                                      variant="default"
                                      disabled={renaming}
                                      onClick={cancelRename}
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
                                    {!readOnly ? (
                                      <ManagementActionsMenu
                                        label={`Actions for company subcategory ${subCategory.name}`}
                                      >
                                        <Menu.Item
                                          onClick={() =>
                                            beginRename({
                                              kind: 'subcategory',
                                              id: subCategory.id,
                                              name: subCategory.name,
                                            })
                                          }
                                        >
                                          Rename subcategory
                                        </Menu.Item>
                                        <Menu.Item
                                          disabled={categoryOptions.length < 2}
                                          onClick={() => {
                                            clearFeedback();
                                            setPendingMove({
                                              id: subCategory.id,
                                              name: subCategory.name,
                                              currentCategoryId:
                                                subCategory.companyDefaultCategoryId,
                                            });
                                            setMoveCategoryId(null);
                                          }}
                                        >
                                          Move to another category…
                                        </Menu.Item>
                                        <Menu.Divider />
                                        <Menu.Item
                                          color="red"
                                          leftSection={<IconTrash size={15} />}
                                          onClick={() => {
                                            beginDelete({
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
          )}
        </Stack>
      </Modal>

      <Modal
        opened={!!pendingMove}
        onClose={() => {
          setPendingMove(null);
          setMoveCategoryId(null);
        }}
        title="Move company subcategory"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Move “{pendingMove?.name ?? ''}” to another company category. Linked
            projects refresh inherited items automatically; project overrides
            remain unchanged.
          </Text>
          {moveAffectedRules.length > 0 ? (
            <Alert color="blue" title="Auto-coding impact">
              {moveAffectedRules.length}{' '}
              {moveAffectedRules.length === 1
                ? 'company rule'
                : 'company rules'}{' '}
              targeting this exact subcategory ID will follow the move
              automatically
              {moveCategoryId
                ? ` to ${
                    categories.find(
                      (category) => category.id === moveCategoryId
                    )?.name ?? 'the selected category'
                  } > ${pendingMove?.name ?? ''}`
                : ''}
              . Inherited project copies will refresh to the same target unless
              their taxonomy placement is overridden locally.
            </Alert>
          ) : null}
          <Select
            label="New company category"
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
              disabled={updateSubCategory.isPending}
              onClick={() => {
                setPendingMove(null);
                setMoveCategoryId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              loading={updateSubCategory.isPending}
              disabled={!pendingMove || !moveCategoryId}
              onClick={async () => {
                if (!pendingMove || !moveCategoryId) return;
                try {
                  clearFeedback();
                  await updateSubCategory.mutateAsync({
                    id: asCompanyDefaultSubCategoryId(pendingMove.id),
                    companyDefaultCategoryId:
                      asCompanyDefaultCategoryId(moveCategoryId),
                  });
                  const movedName = pendingMove.name;
                  setPendingMove(null);
                  setMoveCategoryId(null);
                  setSuccess(`Moved company subcategory "${movedName}".`);
                } catch (err) {
                  setError(
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

      <Modal
        opened={!!pendingDelete}
        onClose={closeDelete}
        title={
          pendingDelete?.kind === 'category'
            ? 'Delete company category?'
            : 'Delete company subcategory?'
        }
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            {pendingDelete?.kind === 'category'
              ? `Delete "${pendingDelete.name}" and all of its company subcategories? Linked project items are detached rather than deleting existing project coding data.`
              : `Delete "${pendingDelete?.name ?? ''}" from the company categories? Linked project items are detached rather than deleting existing project coding data.`}
          </Text>
          {deleteAffectedRules.length > 0 ? (
            <Alert color="yellow" title="Auto-coding rules affected">
              {deleteAffectedRules.length}{' '}
              {deleteAffectedRules.length === 1
                ? 'company rule targets'
                : 'company rules target'}{' '}
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
                  setDeleteRuleHandling(
                    value === 'reassign' ? 'reassign' : 'delete'
                  );
                  setDeleteReplacementCategoryId(null);
                  setDeleteReplacementSubCategoryId(null);
                }}
              />
              {deleteRuleHandling === 'reassign' ? (
                <Group grow align="flex-end" wrap="wrap">
                  <Select
                    label="Replacement company category"
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
                    label="Replacement company subcategory"
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
              Category deletion removes these company rules. Existing linked
              project copies become detached local rules. To preserve the
              company rules, cancel and reassign them before deleting the
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
                  clearFeedback();
                  if (pendingDelete.kind === 'category') {
                    await deleteCategory.mutateAsync(
                      asCompanyDefaultCategoryId(pendingDelete.id)
                    );
                  } else {
                    await deleteSubCategory.mutateAsync({
                      subCategoryId: asCompanyDefaultSubCategoryId(
                        pendingDelete.id
                      ),
                      ...(deleteRuleHandling === 'reassign' &&
                      deleteReplacementSubCategoryId
                        ? {
                            replacementSubCategoryId:
                              asCompanyDefaultSubCategoryId(
                                deleteReplacementSubCategoryId
                              ),
                          }
                        : {}),
                    });
                  }
                  closeDelete();
                  setSuccess(`Deleted company ${pendingDelete.kind}.`);
                } catch (err) {
                  setError(
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
    </>
  );
}

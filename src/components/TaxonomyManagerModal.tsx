import { useState } from 'react';
import {
  Accordion,
  Alert,
  Badge,
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
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { usePromoteProjectSubCategoryToCompanyDefaultMutation } from '../queries/taxonomy';
import classes from '../styles/ui.module.css';
import { asCategoryId, asSubCategoryId } from '../types/ids';
import {
  getProjectStandardBadge,
  isInheritedCompanyStandard,
} from '../utils/projectStandards';
import {
  ManagementActionsMenu,
  ManagementModalIntro,
} from './ManagementModalUi';
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import TaxonomyActionDialogs from './taxonomyManager/TaxonomyActionDialogs';
import type {
  TaxonomyDeleteTarget,
  TaxonomySubCategoryActionTarget,
} from './taxonomyManager/taxonomyActionTypes';

type RenameTarget = {
  kind: 'category' | 'subcategory';
  id: string;
  name: string;
};

type ProjectStandardItem = Parameters<typeof getProjectStandardBadge>[0];

function ProjectStandardStatus(props: { item: ProjectStandardItem }) {
  const { item } = props;
  const badge = getProjectStandardBadge(item);

  if (item.syncStatus === 'overridden' || item.syncStatus === 'detached') {
    return (
      <Badge variant="light" color={badge.color} size="sm">
        {badge.label}
      </Badge>
    );
  }

  return (
    <Text size="xs" c="dimmed">
      {badge.label}
    </Text>
  );
}

function canDeleteProjectStandard(item: ProjectStandardItem) {
  return item.originScope !== 'company' || item.syncStatus === 'detached';
}

export default function TaxonomyManagerModal(props: {
  opened: boolean;
  onClose: () => void;
  taxonomy: TaxonomyHook;
  readOnly?: boolean;
}) {
  const { opened, onClose, taxonomy, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const access = useCompanyAccess(taxonomy.companyId);
  const canPromoteToCompanyDefaults = access.can('company:manage_defaults');
  const promoteProjectSubCategory =
    usePromoteProjectSubCategoryToCompanyDefaultMutation(
      taxonomy.projectId,
      taxonomy.companyId
    );

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<'category' | 'subcategory'>(
    'subcategory'
  );
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newSubCategoryCategoryId, setNewSubCategoryCategoryId] = useState<
    string | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [taxonomySearch, setTaxonomySearch] = useState('');
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [pendingMove, setPendingMove] =
    useState<TaxonomySubCategoryActionTarget | null>(null);
  const [pendingBulkRecode, setPendingBulkRecode] =
    useState<TaxonomySubCategoryActionTarget | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<TaxonomyDeleteTarget | null>(null);

  const categoryOptions = taxonomy.categoryOptions;
  const normalizedSearch = taxonomySearch.trim().toLocaleLowerCase();
  const showSearch =
    taxonomy.categories.length > 10 ||
    taxonomy.subCategories.length > 30 ||
    normalizedSearch.length > 0;
  const visibleCategories = normalizedSearch
    ? taxonomy.categories.filter((category) => {
        if (category.name.toLocaleLowerCase().includes(normalizedSearch)) {
          return true;
        }
        return taxonomy.subCategories.some(
          (subCategory) =>
            subCategory.categoryId === category.id &&
            subCategory.name.toLocaleLowerCase().includes(normalizedSearch)
        );
      })
    : taxonomy.categories;
  const accordionValue = normalizedSearch
    ? visibleCategories.map((category) => category.id)
    : expandedCategoryIds;

  function clearMessages() {
    setError(null);
    setStatus(null);
  }

  function beginDelete(target: TaxonomyDeleteTarget) {
    clearMessages();
    setPendingDelete(target);
  }

  function beginRename(target: RenameTarget) {
    clearMessages();
    setRenameTarget(target);
    setRenameDraft(target.name);
  }

  function cancelRename() {
    setRenameTarget(null);
    setRenameDraft('');
    setError(null);
  }

  async function commitRename() {
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
      clearMessages();
      setRenaming(true);
      if (renameTarget.kind === 'category') {
        await taxonomy.renameCategory(asCategoryId(renameTarget.id), name);
      } else {
        await taxonomy.renameSubCategory(
          asSubCategoryId(renameTarget.id),
          name
        );
      }
      setRenameTarget(null);
      setRenameDraft('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not rename ${renameTarget.kind}.`
      );
    } finally {
      setRenaming(false);
    }
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      clearMessages();
      setCreating(true);
      const categoryId = await taxonomy.addCategory(name);
      setNewCategoryName('');
      setNewSubCategoryCategoryId(categoryId);
      setCreationMode('subcategory');
      setStatus(`Added category "${name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category.');
    } finally {
      setCreating(false);
    }
  }

  async function createSubCategory() {
    const name = newSubCategoryName.trim();
    if (!name || !newSubCategoryCategoryId) return;
    try {
      clearMessages();
      setCreating(true);
      await taxonomy.addSubCategory(
        asCategoryId(newSubCategoryCategoryId),
        name
      );
      setNewSubCategoryName('');
      setExpandedCategoryIds((current) =>
        current.includes(newSubCategoryCategoryId)
          ? current
          : [...current, newSubCategoryCategoryId]
      );
      setStatus(`Added subcategory "${name}".`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not add subcategory.'
      );
    } finally {
      setCreating(false);
    }
  }

  function closeManager() {
    setError(null);
    setStatus(null);
    setRenameTarget(null);
    setRenameDraft('');
    setTaxonomySearch('');
    onClose();
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeManager}
        title="Manage categories & subcategories"
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
        <Stack gap="md" className="taxonomyModal">
          {error ? <Alert color="red">{error}</Alert> : null}
          {status ? (
            <Alert
              color="green"
              withCloseButton
              onClose={() => setStatus(null)}
            >
              {status}
            </Alert>
          ) : null}
          {readOnly ? (
            <Alert color="blue">
              You can view this project taxonomy, but you do not have permission
              to change it.
            </Alert>
          ) : null}

          <ManagementModalIntro title="Company standards">
            Company categories are inherited into this project. Renaming or
            moving an inherited item creates a project-specific override, and
            company-managed items cannot be deleted here. Reapply standards from
            project settings when you need to sync company changes into this
            project.
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
                        ? 'Add subcategory'
                        : 'Add category'}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {creationMode === 'subcategory'
                        ? 'Create a coding option under an existing category.'
                        : 'Create a new top-level category for this project.'}
                    </Text>
                  </Stack>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => {
                      clearMessages();
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
                      label="Category"
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
                        clearMessages();
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
                        clearMessages();
                        setNewSubCategoryName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void createSubCategory();
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
                      onClick={() => void createSubCategory()}
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
                        clearMessages();
                        setNewCategoryName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void createCategory();
                        }
                      }}
                      className={classes.fieldGrow}
                    />
                    <Button
                      leftSection={<IconPlus size={16} />}
                      loading={creating}
                      disabled={!newCategoryName.trim()}
                      fullWidth={isMobile}
                      onClick={() => void createCategory()}
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
              value={taxonomySearch}
              onChange={(event) => setTaxonomySearch(event.currentTarget.value)}
            />
          ) : null}

          {taxonomy.categories.length === 0 ? (
            <Text className={classes.emptyState}>
              No categories yet. Add a category before creating subcategories.
            </Text>
          ) : visibleCategories.length === 0 ? (
            <Text className={classes.emptyState}>
              No categories or subcategories match “{taxonomySearch.trim()}”.
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
                const allSubCategories = taxonomy.subCategories.filter(
                  (subCategory) => subCategory.categoryId === category.id
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
                const canDeleteCategory = canDeleteProjectStandard(category);
                const renamingCategory =
                  renameTarget?.kind === 'category' &&
                  renameTarget.id === category.id;

                return (
                  <Accordion.Item key={category.id} value={category.id}>
                    {renamingCategory ? (
                      <Group p="sm" align="flex-end" wrap="wrap">
                        <TextInput
                          label="Rename category"
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
                              void commitRename();
                            }
                            if (event.key === 'Escape') cancelRename();
                          }}
                          className={classes.fieldGrow}
                        />
                        <Button
                          size="compact-sm"
                          loading={renaming}
                          disabled={!renameDraft.trim()}
                          onClick={() => void commitRename()}
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
                            <Group gap="xs" wrap="wrap">
                              <Text size="xs" c="dimmed">
                                {allSubCategories.length}{' '}
                                {allSubCategories.length === 1
                                  ? 'subcategory'
                                  : 'subcategories'}
                              </Text>
                              <ProjectStandardStatus item={category} />
                            </Group>
                          </Stack>
                        </Accordion.Control>
                        {!readOnly ? (
                          <ManagementActionsMenu
                            label={`Actions for category ${category.name}`}
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
                            {canDeleteCategory ? (
                              <>
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
                              </>
                            ) : null}
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
                            const inherited =
                              isInheritedCompanyStandard(subCategory);
                            const canDeleteSubCategory =
                              canDeleteProjectStandard(subCategory);
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
                                      label="Rename subcategory"
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
                                          void commitRename();
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
                                      onClick={() => void commitRename()}
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
                                    <Stack
                                      gap={3}
                                      className={classes.fieldGrow}
                                    >
                                      <Text fw={500}>{subCategory.name}</Text>
                                      <ProjectStandardStatus
                                        item={subCategory}
                                      />
                                    </Stack>
                                    {!readOnly ? (
                                      <ManagementActionsMenu
                                        label={`Actions for subcategory ${subCategory.name}`}
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
                                            clearMessages();
                                            setPendingMove({
                                              subCategoryId: subCategory.id,
                                              subCategoryName: subCategory.name,
                                              currentCategoryId:
                                                subCategory.categoryId,
                                            });
                                          }}
                                        >
                                          Move to another category…
                                        </Menu.Item>
                                        <Menu.Item
                                          disabled={
                                            taxonomy.subCategories.length < 2
                                          }
                                          onClick={() => {
                                            clearMessages();
                                            setPendingBulkRecode({
                                              subCategoryId: subCategory.id,
                                              subCategoryName: subCategory.name,
                                              currentCategoryId:
                                                subCategory.categoryId,
                                            });
                                          }}
                                        >
                                          Recode transactions using this…
                                        </Menu.Item>
                                        {canPromoteToCompanyDefaults &&
                                        !inherited ? (
                                          <Menu.Item
                                            disabled={
                                              promoteProjectSubCategory.isPending
                                            }
                                            onClick={async () => {
                                              try {
                                                clearMessages();
                                                const result =
                                                  await promoteProjectSubCategory.mutateAsync(
                                                    {
                                                      subCategoryId:
                                                        subCategory.id,
                                                    }
                                                  );
                                                setStatus(
                                                  result.categoryCreated ||
                                                    result.subCategoryCreated
                                                    ? 'Added the project taxonomy to company defaults and synced linked projects.'
                                                    : 'The matching company default already existed; linked projects are now aligned.'
                                                );
                                              } catch (err) {
                                                setError(
                                                  err instanceof Error
                                                    ? err.message
                                                    : 'Could not add this subcategory to company defaults.'
                                                );
                                              }
                                            }}
                                          >
                                            Add to company defaults
                                          </Menu.Item>
                                        ) : null}
                                        {canDeleteSubCategory ? (
                                          <>
                                            <Menu.Divider />
                                            <Menu.Item
                                              color="red"
                                              leftSection={
                                                <IconTrash size={15} />
                                              }
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
                                          </>
                                        ) : null}
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

      <TaxonomyActionDialogs
        taxonomy={taxonomy}
        isMobile={isMobile}
        error={error}
        pendingMove={pendingMove}
        pendingBulkRecode={pendingBulkRecode}
        pendingDelete={pendingDelete}
        onCloseMove={() => setPendingMove(null)}
        onCloseBulkRecode={() => setPendingBulkRecode(null)}
        onCloseDelete={() => setPendingDelete(null)}
        onClearMessages={clearMessages}
        onError={setError}
        onStatus={setStatus}
      />
    </>
  );
}

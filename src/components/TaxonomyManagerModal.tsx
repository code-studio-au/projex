import { useReducer } from 'react';
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

type TaxonomyManagerState = {
  error: string | null;
  status: string | null;
  creationMode: 'category' | 'subcategory';
  newCategoryName: string;
  newSubCategoryName: string;
  newSubCategoryCategoryId: string | null;
  creating: boolean;
  expandedCategoryIds: string[];
  taxonomySearch: string;
  renameTarget: RenameTarget | null;
  renameDraft: string;
  renaming: boolean;
  pendingMove: TaxonomySubCategoryActionTarget | null;
  pendingBulkRecode: TaxonomySubCategoryActionTarget | null;
  pendingDelete: TaxonomyDeleteTarget | null;
};

type TaxonomyManagerAction =
  | { type: 'patch'; patch: Partial<TaxonomyManagerState> }
  | { type: 'clearMessages' }
  | { type: 'beginRename'; target: RenameTarget }
  | { type: 'cancelRename' }
  | { type: 'categoryCreated'; categoryId: string; name: string }
  | { type: 'subcategoryCreated'; categoryId: string; name: string }
  | { type: 'closeManager' };

const initialTaxonomyManagerState: TaxonomyManagerState = {
  error: null,
  status: null,
  creationMode: 'subcategory',
  newCategoryName: '',
  newSubCategoryName: '',
  newSubCategoryCategoryId: null,
  creating: false,
  expandedCategoryIds: [],
  taxonomySearch: '',
  renameTarget: null,
  renameDraft: '',
  renaming: false,
  pendingMove: null,
  pendingBulkRecode: null,
  pendingDelete: null,
};

function taxonomyManagerReducer(
  state: TaxonomyManagerState,
  action: TaxonomyManagerAction
): TaxonomyManagerState {
  if (action.type === 'patch') return { ...state, ...action.patch };
  if (action.type === 'clearMessages') {
    return { ...state, error: null, status: null };
  }
  if (action.type === 'beginRename') {
    return {
      ...state,
      error: null,
      status: null,
      renameTarget: action.target,
      renameDraft: action.target.name,
    };
  }
  if (action.type === 'cancelRename') {
    return { ...state, renameTarget: null, renameDraft: '', error: null };
  }
  if (action.type === 'categoryCreated') {
    return {
      ...state,
      newCategoryName: '',
      newSubCategoryCategoryId: action.categoryId,
      creationMode: 'subcategory',
      status: `Added category "${action.name}".`,
    };
  }
  if (action.type === 'subcategoryCreated') {
    return {
      ...state,
      newSubCategoryName: '',
      expandedCategoryIds: state.expandedCategoryIds.includes(action.categoryId)
        ? state.expandedCategoryIds
        : [...state.expandedCategoryIds, action.categoryId],
      status: `Added subcategory "${action.name}".`,
    };
  }
  return {
    ...state,
    error: null,
    status: null,
    renameTarget: null,
    renameDraft: '',
    taxonomySearch: '',
  };
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

  const [managerState, dispatchManager] = useReducer(
    taxonomyManagerReducer,
    initialTaxonomyManagerState
  );
  const {
    error,
    status,
    creationMode,
    newCategoryName,
    newSubCategoryName,
    newSubCategoryCategoryId,
    creating,
    expandedCategoryIds,
    taxonomySearch,
    renameTarget,
    renameDraft,
    renaming,
    pendingMove,
    pendingBulkRecode,
    pendingDelete,
  } = managerState;
  const patchManager = (patch: Partial<TaxonomyManagerState>) =>
    dispatchManager({ type: 'patch', patch });

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
    dispatchManager({ type: 'clearMessages' });
  }

  function beginDelete(target: TaxonomyDeleteTarget) {
    dispatchManager({
      type: 'patch',
      patch: { error: null, status: null, pendingDelete: target },
    });
  }

  function beginRename(target: RenameTarget) {
    dispatchManager({ type: 'beginRename', target });
  }

  function cancelRename() {
    dispatchManager({ type: 'cancelRename' });
  }

  async function commitRename() {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) {
      patchManager({
        error:
          renameTarget.kind === 'category'
            ? 'Category name is required.'
            : 'Subcategory name is required.',
      });
      return;
    }
    if (name === renameTarget.name.trim()) {
      cancelRename();
      return;
    }

    try {
      clearMessages();
      patchManager({ renaming: true });
      if (renameTarget.kind === 'category') {
        await taxonomy.renameCategory(asCategoryId(renameTarget.id), name);
      } else {
        await taxonomy.renameSubCategory(
          asSubCategoryId(renameTarget.id),
          name
        );
      }
      dispatchManager({ type: 'cancelRename' });
    } catch (err) {
      patchManager({
        error:
          err instanceof Error
            ? err.message
            : `Could not rename ${renameTarget.kind}.`,
      });
    } finally {
      patchManager({ renaming: false });
    }
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      clearMessages();
      patchManager({ creating: true });
      const categoryId = await taxonomy.addCategory(name);
      dispatchManager({ type: 'categoryCreated', categoryId, name });
    } catch (err) {
      patchManager({
        error: err instanceof Error ? err.message : 'Could not add category.',
      });
    } finally {
      patchManager({ creating: false });
    }
  }

  async function createSubCategory() {
    const name = newSubCategoryName.trim();
    if (!name || !newSubCategoryCategoryId) return;
    try {
      clearMessages();
      patchManager({ creating: true });
      await taxonomy.addSubCategory(
        asCategoryId(newSubCategoryCategoryId),
        name
      );
      dispatchManager({
        type: 'subcategoryCreated',
        categoryId: newSubCategoryCategoryId,
        name,
      });
    } catch (err) {
      patchManager({
        error:
          err instanceof Error ? err.message : 'Could not add subcategory.',
      });
    } finally {
      patchManager({ creating: false });
    }
  }

  function closeManager() {
    dispatchManager({ type: 'closeManager' });
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
              onClose={() => patchManager({ status: null })}
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
                      patchManager({
                        error: null,
                        status: null,
                        creationMode:
                          creationMode === 'subcategory'
                            ? 'category'
                            : 'subcategory',
                      });
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
                        patchManager({
                          error: null,
                          status: null,
                          newSubCategoryCategoryId: value,
                        });
                      }}
                      className={classes.fieldGrow}
                    />
                    <TextInput
                      label="Subcategory name"
                      placeholder="e.g. Flights"
                      value={newSubCategoryName}
                      disabled={categoryOptions.length === 0}
                      onChange={(event) => {
                        patchManager({
                          error: null,
                          status: null,
                          newSubCategoryName: event.currentTarget.value,
                        });
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
                        patchManager({
                          error: null,
                          status: null,
                          newCategoryName: event.currentTarget.value,
                        });
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
              onChange={(event) =>
                patchManager({ taxonomySearch: event.currentTarget.value })
              }
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
              onChange={(expandedCategoryIds) =>
                patchManager({ expandedCategoryIds })
              }
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
                            patchManager({
                              error: null,
                              renameDraft: event.currentTarget.value,
                            });
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
                                        patchManager({
                                          error: null,
                                          renameDraft:
                                            event.currentTarget.value,
                                        });
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
                                            patchManager({
                                              error: null,
                                              status: null,
                                              pendingMove: {
                                                subCategoryId: subCategory.id,
                                                subCategoryName:
                                                  subCategory.name,
                                                currentCategoryId:
                                                  subCategory.categoryId,
                                              },
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
                                            patchManager({
                                              error: null,
                                              status: null,
                                              pendingBulkRecode: {
                                                subCategoryId: subCategory.id,
                                                subCategoryName:
                                                  subCategory.name,
                                                currentCategoryId:
                                                  subCategory.categoryId,
                                              },
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
                                                patchManager({
                                                  status:
                                                    result.categoryCreated ||
                                                    result.subCategoryCreated
                                                      ? 'Added the project taxonomy to company defaults and synced linked projects.'
                                                      : 'The matching company default already existed; linked projects are now aligned.',
                                                });
                                              } catch (err) {
                                                patchManager({
                                                  error:
                                                    err instanceof Error
                                                      ? err.message
                                                      : 'Could not add this subcategory to company defaults.',
                                                });
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
        onCloseMove={() => patchManager({ pendingMove: null })}
        onCloseBulkRecode={() => patchManager({ pendingBulkRecode: null })}
        onCloseDelete={() => patchManager({ pendingDelete: null })}
        onClearMessages={clearMessages}
        onError={(error) => patchManager({ error })}
        onStatus={(status) => patchManager({ status })}
      />
    </>
  );
}

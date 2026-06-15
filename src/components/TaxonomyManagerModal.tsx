import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
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
import { asCategoryId, asSubCategoryId } from '../types/ids';
import {
  useBulkRecodeProjectTransactionsMutation,
  usePromoteProjectSubCategoryToCompanyDefaultMutation,
} from '../queries/taxonomy';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import classes from '../styles/ui.module.css';

export default function TaxonomyManagerModal(props: {
  opened: boolean;
  onClose: () => void;
  taxonomy: TaxonomyHook;
  readOnly?: boolean;
}) {
  const { opened, onClose, taxonomy, readOnly = false } = props;

  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>(
    {}
  );
  const [newSubNameByCat, setNewSubNameByCat] = useState<
    Record<string, string>
  >({});
  const [subCategoryDrafts, setSubCategoryDrafts] = useState<
    Record<string, string>
  >({});
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'category'; id: string; name: string }
    | { kind: 'subcategory'; id: string; name: string }
    | null
  >(null);
  const [pendingBulkRecode, setPendingBulkRecode] = useState<{
    subCategoryId: string;
    subCategoryName: string;
    currentCategoryId: string;
  } | null>(null);
  const [bulkRecodeCategoryId, setBulkRecodeCategoryId] = useState<
    string | null
  >(null);
  const [bulkRecodeSubCategoryId, setBulkRecodeSubCategoryId] = useState<
    string | null
  >(null);
  const access = useCompanyAccess(taxonomy.companyId);
  const canPromoteToCompanyDefaults = access.can('company:manage_defaults');
  const bulkRecode = useBulkRecodeProjectTransactionsMutation(
    taxonomy.projectId
  );
  const promoteProjectSubCategory =
    usePromoteProjectSubCategoryToCompanyDefaultMutation(
      taxonomy.projectId,
      taxonomy.companyId
    );

  const categoryOptions = taxonomy.categoryOptions;
  const bulkRecodeSubCategoryOptions = taxonomy.subCategories
    .filter((subCategory) => subCategory.categoryId === bulkRecodeCategoryId)
    .map((subCategory) => ({
      value: subCategory.id,
      label: subCategory.name,
    }));

  async function commitCategoryName(categoryId: string, fallbackName: string) {
    const nextName = (categoryDrafts[categoryId] ?? fallbackName).trim();
    const currentName = fallbackName.trim();
    if (!nextName || nextName === currentName) {
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      return;
    }

    try {
      setError(null);
      await taxonomy.renameCategory(asCategoryId(categoryId), nextName);
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    } catch (err) {
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      setError(
        err instanceof Error ? err.message : 'Could not rename category.'
      );
    }
  }

  async function commitSubCategoryName(
    subCategoryId: string,
    fallbackName: string
  ) {
    const nextName = (subCategoryDrafts[subCategoryId] ?? fallbackName).trim();
    const currentName = fallbackName.trim();
    if (!nextName || nextName === currentName) {
      setSubCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[subCategoryId];
        return next;
      });
      return;
    }

    try {
      setError(null);
      await taxonomy.renameSubCategory(
        asSubCategoryId(subCategoryId),
        nextName
      );
      setSubCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[subCategoryId];
        return next;
      });
    } catch (err) {
      setSubCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[subCategoryId];
        return next;
      });
      setError(
        err instanceof Error ? err.message : 'Could not rename subcategory.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage categories & subcategories"
      fullScreen={isMobile}
      centered={!isMobile}
      size="lg"
      styles={{
        body: {
          maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
          overflowY: 'auto',
        },
      }}
    >
      <Stack gap="md" className="taxonomyModal">
        {error ? <Alert color="red">{error}</Alert> : null}
        {status ? <Alert color="green">{status}</Alert> : null}
        {readOnly && (
          <Text size="sm" c="dimmed" className="panelHelperText">
            You don’t have permission to edit categories in this project.
          </Text>
        )}
        {!readOnly ? (
          <Group justify="space-between" align="center" wrap="wrap">
            <Text
              size="sm"
              c="dimmed"
              className="panelHelperText"
              style={{ flex: 1 }}
            >
              Company defaults can be safely added here. Existing project
              categories and subcategories are left unchanged.
            </Text>
            <Button
              variant="light"
              disabled={taxonomy.isApplyingCompanyDefaults}
              onClick={async () => {
                try {
                  setError(null);
                  setStatus(null);
                  const result = await taxonomy.applyCompanyDefaults();
                  if (!result.companyDefaultsConfigured) {
                    setStatus(
                      'No company defaults are configured for this company yet.'
                    );
                    return;
                  }
                  if (
                    result.categoriesAdded === 0 &&
                    result.subCategoriesAdded === 0
                  ) {
                    setStatus(
                      'No company defaults were added because this project already includes them.'
                    );
                    return;
                  }
                  setStatus(
                    `Applied company defaults: ${result.categoriesAdded} categories and ${result.subCategoriesAdded} subcategories added.`
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Could not apply company defaults.'
                  );
                }
              }}
            >
              Apply company defaults
            </Button>
          </Group>
        ) : null}
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label="Add category"
            placeholder="e.g. Travel"
            value={newCategoryName}
            onChange={(e) => {
              setError(null);
              setStatus(null);
              setNewCategoryName(e.currentTarget.value);
            }}
            style={{ width: '100%' }}
            disabled={readOnly}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            disabled={readOnly}
            fullWidth={isMobile}
            onClick={async () => {
              const name = newCategoryName.trim();
              if (!name) return;
              try {
                setError(null);
                setStatus(null);
                await taxonomy.addCategory(name);
                setNewCategoryName('');
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : 'Could not add category.'
                );
              }
            }}
          >
            Add
          </Button>
        </Group>

        <Divider />

        <Stack gap="lg">
          {taxonomy.categories.map((cat) => {
            const subcats = taxonomy.subCategories.filter(
              (s) => s.categoryId === cat.id
            );
            return (
              <Paper
                key={cat.id}
                withBorder
                radius="md"
                p="md"
                className="taxonomyCategoryCard"
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end">
                    <TextInput
                      label="Category"
                      value={categoryDrafts[cat.id] ?? cat.name}
                      onChange={(e) => {
                        setError(null);
                        setStatus(null);
                        setCategoryDrafts((prev) => ({
                          ...prev,
                          [cat.id]: e.currentTarget.value,
                        }));
                      }}
                      onBlur={() => {
                        void commitCategoryName(cat.id, cat.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitCategoryName(cat.id, cat.name);
                        }
                        if (e.key === 'Escape') {
                          setCategoryDrafts((prev) => {
                            const next = { ...prev };
                            delete next[cat.id];
                            return next;
                          });
                          setError(null);
                        }
                      }}
                      className={classes.fieldGrow}
                      disabled={readOnly}
                    />
                    {isMobile ? (
                      <Button
                        color="red"
                        variant="light"
                        fullWidth
                        leftSection={<IconTrash size={16} />}
                        disabled={readOnly}
                        onClick={() =>
                          setPendingDelete({
                            kind: 'category',
                            id: cat.id,
                            name: cat.name,
                          })
                        }
                      >
                        Delete category
                      </Button>
                    ) : (
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        title="Delete category"
                        disabled={readOnly}
                        onClick={() =>
                          setPendingDelete({
                            kind: 'category',
                            id: cat.id,
                            name: cat.name,
                          })
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>

                  <Group align="flex-end" wrap="wrap">
                    <TextInput
                      label="Add subcategory"
                      placeholder="e.g. Flights"
                      value={newSubNameByCat[cat.id] ?? ''}
                      onChange={(e) => {
                        setError(null);
                        setStatus(null);
                        // Defensive: in some environments/input methods the event target can be null.
                        // Avoid capturing the synthetic event inside the state updater.
                        const value = e?.currentTarget?.value ?? '';
                        setNewSubNameByCat((prev) => ({
                          ...prev,
                          [cat.id]: value,
                        }));
                      }}
                      className={classes.fieldGrow}
                      disabled={readOnly}
                    />
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={16} />}
                      disabled={readOnly}
                      fullWidth={isMobile}
                      onClick={async () => {
                        const name = (newSubNameByCat[cat.id] ?? '').trim();
                        if (!name) return;
                        try {
                          setError(null);
                          setStatus(null);
                          await taxonomy.addSubCategory(cat.id, name);
                          setNewSubNameByCat((prev) => ({
                            ...prev,
                            [cat.id]: '',
                          }));
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Could not add subcategory.'
                          );
                        }
                      }}
                    >
                      Add
                    </Button>
                  </Group>

                  {subcats.length === 0 ? (
                    <Text className={classes.emptyState}>
                      No subcategories yet.
                    </Text>
                  ) : (
                    <Stack gap={6}>
                      {subcats.map((sc) => (
                        <Group key={sc.id} align="flex-end" wrap="wrap">
                          <TextInput
                            label="Subcategory"
                            value={subCategoryDrafts[sc.id] ?? sc.name}
                            onChange={(e) => {
                              setError(null);
                              setStatus(null);
                              setSubCategoryDrafts((prev) => ({
                                ...prev,
                                [sc.id]: e?.currentTarget?.value ?? '',
                              }));
                            }}
                            onBlur={() => {
                              void commitSubCategoryName(sc.id, sc.name);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void commitSubCategoryName(sc.id, sc.name);
                              }
                              if (e.key === 'Escape') {
                                setSubCategoryDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[sc.id];
                                  return next;
                                });
                                setError(null);
                              }
                            }}
                            className={classes.fieldGrow}
                            disabled={readOnly}
                          />
                          <Select
                            label="Move to"
                            data={categoryOptions}
                            value={sc.categoryId}
                            onChange={async (v) => {
                              if (!v || v === sc.categoryId) return;
                              try {
                                setError(null);
                                setStatus(null);
                                await taxonomy.moveSubCategory(
                                  sc.id,
                                  asCategoryId(v)
                                );
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not move subcategory.'
                                );
                              }
                            }}
                            className={classes.fieldGrow}
                            disabled={readOnly}
                          />
                          <Group gap="xs" wrap="wrap">
                            <Button
                              variant="subtle"
                              size="xs"
                              disabled={readOnly}
                              onClick={() => {
                                setError(null);
                                setStatus(null);
                                setPendingBulkRecode({
                                  subCategoryId: sc.id,
                                  subCategoryName: sc.name,
                                  currentCategoryId: sc.categoryId,
                                });
                                setBulkRecodeCategoryId(sc.categoryId);
                                setBulkRecodeSubCategoryId(null);
                              }}
                            >
                              Bulk recode
                            </Button>
                            {canPromoteToCompanyDefaults ? (
                              <Button
                                variant="subtle"
                                size="xs"
                                disabled={
                                  readOnly ||
                                  promoteProjectSubCategory.isPending
                                }
                                onClick={async () => {
                                  try {
                                    setError(null);
                                    setStatus(null);
                                    const result =
                                      await promoteProjectSubCategory.mutateAsync(
                                        {
                                          subCategoryId: sc.id,
                                        }
                                      );
                                    setStatus(
                                      result.categoryCreated ||
                                        result.subCategoryCreated
                                        ? 'Promoted project taxonomy into company defaults and synced linked projects.'
                                        : 'Matching company default already existed; linked projects are now aligned.'
                                    );
                                  } catch (err) {
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Could not promote subcategory.'
                                    );
                                  }
                                }}
                              >
                                Promote default
                              </Button>
                            ) : null}
                          </Group>
                          {isMobile ? (
                            <Button
                              color="red"
                              variant="light"
                              fullWidth
                              leftSection={<IconTrash size={16} />}
                              disabled={readOnly}
                              onClick={() =>
                                setPendingDelete({
                                  kind: 'subcategory',
                                  id: sc.id,
                                  name: sc.name,
                                })
                              }
                            >
                              Delete subcategory
                            </Button>
                          ) : (
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              title="Delete subcategory"
                              disabled={readOnly}
                              onClick={() =>
                                setPendingDelete({
                                  kind: 'subcategory',
                                  id: sc.id,
                                  name: sc.name,
                                })
                              }
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Stack>

      <Modal
        opened={!!pendingBulkRecode}
        onClose={() => {
          setPendingBulkRecode(null);
          setBulkRecodeCategoryId(null);
          setBulkRecodeSubCategoryId(null);
        }}
        title="Bulk recode transactions"
        fullScreen={isMobile}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Recode all unlocked transactions currently using "
            {pendingBulkRecode?.subCategoryName ?? ''}" into a new taxonomy
            target.
          </Text>
          <Select
            label="Target category"
            data={categoryOptions}
            value={bulkRecodeCategoryId}
            onChange={(value) => {
              setBulkRecodeCategoryId(value);
              setBulkRecodeSubCategoryId(null);
            }}
          />
          <Select
            label="Target subcategory"
            data={bulkRecodeSubCategoryOptions}
            value={bulkRecodeSubCategoryId}
            disabled={!bulkRecodeCategoryId}
            onChange={(value) => setBulkRecodeSubCategoryId(value)}
          />
          <Group className={classes.footerRow}>
            <Button
              variant="light"
              fullWidth={isMobile}
              onClick={() => {
                setPendingBulkRecode(null);
                setBulkRecodeCategoryId(null);
                setBulkRecodeSubCategoryId(null);
              }}
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
                  setError(null);
                  setStatus(null);
                  const result = await bulkRecode.mutateAsync({
                    fromSubCategoryId: asSubCategoryId(
                      pendingBulkRecode.subCategoryId
                    ),
                    toCategoryId: asCategoryId(bulkRecodeCategoryId),
                    toSubCategoryId: asSubCategoryId(bulkRecodeSubCategoryId),
                  });
                  setPendingBulkRecode(null);
                  setBulkRecodeCategoryId(null);
                  setBulkRecodeSubCategoryId(null);
                  setStatus(
                    result.updatedCount === 0
                      ? 'No unlocked transactions needed recoding for that subcategory.'
                      : `Bulk recoded ${result.updatedCount} transactions.`
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Could not bulk recode transactions.'
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
        onClose={() => setPendingDelete(null)}
        title={
          pendingDelete?.kind === 'category'
            ? 'Delete category?'
            : 'Delete subcategory?'
        }
        fullScreen={isMobile}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            {pendingDelete?.kind === 'category'
              ? `Deleting "${pendingDelete.name}" will remove its subcategories and uncoded affected transactions and budgets.`
              : `Deleting "${pendingDelete?.name ?? ''}" will uncode affected transactions and budgets.`}
          </Text>
          <Group className={classes.footerRow}>
            <Button
              variant="light"
              fullWidth={isMobile}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  setError(null);
                  setStatus(null);
                  if (pendingDelete.kind === 'category') {
                    await taxonomy.deleteCategory(
                      asCategoryId(pendingDelete.id)
                    );
                  } else {
                    await taxonomy.deleteSubCategory(
                      asSubCategoryId(pendingDelete.id)
                    );
                  }
                  setPendingDelete(null);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Could not delete taxonomy item.'
                  );
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}

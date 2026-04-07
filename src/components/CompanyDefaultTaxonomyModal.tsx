import { useMemo, useState } from 'react';
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

import type { CompanyId } from '../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../types';
import {
  useCompanyDefaultCategoriesQuery,
  useCompanyDefaultSubCategoriesQuery,
  useCreateCompanyDefaultCategoryMutation,
  useCreateCompanyDefaultSubCategoryMutation,
  useDeleteCompanyDefaultCategoryMutation,
  useDeleteCompanyDefaultSubCategoryMutation,
  useUpdateCompanyDefaultCategoryMutation,
  useUpdateCompanyDefaultSubCategoryMutation,
} from '../queries/taxonomy';

export default function CompanyDefaultTaxonomyModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const categoriesQ = useCompanyDefaultCategoriesQuery(companyId);
  const subCategoriesQ = useCompanyDefaultSubCategoriesQuery(companyId);
  const createCategory = useCreateCompanyDefaultCategoryMutation(companyId);
  const updateCategory = useUpdateCompanyDefaultCategoryMutation(companyId);
  const deleteCategory = useDeleteCompanyDefaultCategoryMutation(companyId);
  const createSubCategory = useCreateCompanyDefaultSubCategoryMutation(companyId);
  const updateSubCategory = useUpdateCompanyDefaultSubCategoryMutation(companyId);
  const deleteSubCategory = useDeleteCompanyDefaultSubCategoryMutation(companyId);

  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const subCategories = useMemo(() => subCategoriesQ.data ?? [], [subCategoriesQ.data]);
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories]
  );

  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [subCategoryDrafts, setSubCategoryDrafts] = useState<Record<string, string>>({});
  const [newSubNameByCat, setNewSubNameByCat] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'category'; id: string; name: string }
    | { kind: 'subcategory'; id: string; name: string }
    | null
  >(null);

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
      setSuccess(null);
      await updateCategory.mutateAsync({ id: asCompanyDefaultCategoryId(categoryId), name: nextName });
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      setSuccess('Updated company default category.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename company default category.');
    }
  }

  async function commitSubCategoryName(subCategoryId: string, fallbackName: string) {
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
      setSuccess(null);
      await updateSubCategory.mutateAsync({
        id: asCompanyDefaultSubCategoryId(subCategoryId),
        name: nextName,
      });
      setSubCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[subCategoryId];
        return next;
      });
      setSuccess('Updated company default subcategory.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename company default subcategory.');
    }
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title="Manage company default categories"
        size={isMobile ? '100%' : 'lg'}
      >
        <Stack gap="md" className="taxonomyModal">
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? <Alert color="green">{success}</Alert> : null}
          {readOnly ? (
            <Text size="sm" c="dimmed" className="panelHelperText">
              You don’t have permission to edit company defaults.
            </Text>
          ) : (
            <Text size="sm" c="dimmed" className="panelHelperText">
              Company defaults can be applied into projects later. Existing project taxonomy is never overwritten.
            </Text>
          )}

          <Group align="flex-end" wrap="wrap">
            <TextInput
              label="Add company default category"
              placeholder="e.g. Travel"
              value={newCategoryName}
              onChange={(e) => {
                setError(null);
                setSuccess(null);
                setNewCategoryName(e.currentTarget.value);
              }}
              style={{ width: '100%' }}
              disabled={readOnly}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              disabled={readOnly || createCategory.isPending}
              fullWidth={isMobile}
              onClick={async () => {
                const name = newCategoryName.trim();
                if (!name) return;
                try {
                  setError(null);
                  setSuccess(null);
                  await createCategory.mutateAsync({ companyId, name });
                  setNewCategoryName('');
                  setSuccess('Added company default category.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not add company default category.');
                }
              }}
            >
              Add
            </Button>
          </Group>

          <Divider />

          <Stack gap="lg">
            {categories.length === 0 ? (
              <Text size="sm" c="dimmed" className="panelHelperText">
                No company default categories yet.
              </Text>
            ) : null}

            {categories.map((category) => {
              const categorySubCategories = subCategories.filter(
                (subCategory) => subCategory.companyDefaultCategoryId === category.id
              );
              return (
                <Paper key={category.id} withBorder radius="md" p="md" className="taxonomyCategoryCard">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-end">
                      <TextInput
                        label="Category"
                        value={categoryDrafts[category.id] ?? category.name}
                        onChange={(e) => {
                          setError(null);
                          setSuccess(null);
                          const value = e?.currentTarget?.value ?? '';
                          setCategoryDrafts((prev) => ({ ...prev, [category.id]: value }));
                        }}
                        onBlur={() => {
                          void commitCategoryName(category.id, category.name);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitCategoryName(category.id, category.name);
                          }
                        }}
                        style={{ flex: 1, minWidth: isMobile ? '100%' : 0 }}
                        disabled={readOnly}
                      />
                      {isMobile ? (
                        <Button
                          color="red"
                          variant="light"
                          fullWidth
                          leftSection={<IconTrash size={16} />}
                          disabled={readOnly}
                          onClick={() => setPendingDelete({ kind: 'category', id: category.id, name: category.name })}
                        >
                          Delete category
                        </Button>
                      ) : (
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title="Delete category"
                          disabled={readOnly}
                          onClick={() => setPendingDelete({ kind: 'category', id: category.id, name: category.name })}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Group>

                    <Group align="flex-end" wrap="wrap">
                      <TextInput
                        label="Add subcategory"
                        placeholder="e.g. Flights"
                        value={newSubNameByCat[category.id] ?? ''}
                        onChange={(e) => {
                          setError(null);
                          setSuccess(null);
                          const value = e?.currentTarget?.value ?? '';
                          setNewSubNameByCat((prev) => ({ ...prev, [category.id]: value }));
                        }}
                        style={{ width: '100%' }}
                        disabled={readOnly}
                      />
                      <Button
                        variant="light"
                        leftSection={<IconPlus size={16} />}
                        disabled={readOnly || createSubCategory.isPending}
                        fullWidth={isMobile}
                        onClick={async () => {
                          const name = (newSubNameByCat[category.id] ?? '').trim();
                          if (!name) return;
                          try {
                            setError(null);
                            setSuccess(null);
                            await createSubCategory.mutateAsync({
                              companyId,
                              companyDefaultCategoryId: category.id,
                              name,
                            });
                            setNewSubNameByCat((prev) => ({ ...prev, [category.id]: '' }));
                            setSuccess('Added company default subcategory.');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Could not add company default subcategory.');
                          }
                        }}
                      >
                        Add
                      </Button>
                    </Group>

                    {categorySubCategories.length === 0 ? (
                      <Text size="sm" c="dimmed" className="panelHelperText">
                        No subcategories yet.
                      </Text>
                    ) : (
                      <Stack gap={6}>
                        {categorySubCategories.map((subCategory) => (
                          <Group key={subCategory.id} align="flex-end" wrap="wrap">
                            <TextInput
                              label="Subcategory"
                              value={subCategoryDrafts[subCategory.id] ?? subCategory.name}
                              onChange={(e) => {
                                setError(null);
                                setSuccess(null);
                                const value = e?.currentTarget?.value ?? '';
                                setSubCategoryDrafts((prev) => ({
                                  ...prev,
                                  [subCategory.id]: value,
                                }));
                              }}
                              onBlur={() => {
                                void commitSubCategoryName(subCategory.id, subCategory.name);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void commitSubCategoryName(subCategory.id, subCategory.name);
                                }
                              }}
                              style={{ width: '100%', flex: 1 }}
                              disabled={readOnly}
                            />
                            <Select
                              label="Move to"
                              data={categoryOptions}
                              value={subCategory.companyDefaultCategoryId}
                              onChange={async (value) => {
                                if (!value || value === subCategory.companyDefaultCategoryId) return;
                                try {
                                  setError(null);
                                  setSuccess(null);
                                  await updateSubCategory.mutateAsync({
                                    id: asCompanyDefaultSubCategoryId(subCategory.id),
                                    companyDefaultCategoryId: asCompanyDefaultCategoryId(value),
                                  });
                                  setSuccess('Moved company default subcategory.');
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Could not move company default subcategory.');
                                }
                              }}
                              style={{ width: '100%', maxWidth: isMobile ? '100%' : 220 }}
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
                                    kind: 'subcategory',
                                    id: subCategory.id,
                                    name: subCategory.name,
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
                                    id: subCategory.id,
                                    name: subCategory.name,
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
      </Modal>

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete?.kind === 'category' ? 'Delete company default category?' : 'Delete company default subcategory?'}
        centered
      >
        <Stack gap="md">
          <Text>
            {pendingDelete?.kind === 'category'
              ? `Delete “${pendingDelete.name}” and all of its default subcategories? This does not change existing project taxonomy.`
              : `Delete “${pendingDelete?.name}” from the company defaults? This does not change existing project taxonomy.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  setError(null);
                  setSuccess(null);
                  if (pendingDelete.kind === 'category') {
                    await deleteCategory.mutateAsync(asCompanyDefaultCategoryId(pendingDelete.id));
                    setSuccess('Deleted company default category.');
                  } else {
                    await deleteSubCategory.mutateAsync(asCompanyDefaultSubCategoryId(pendingDelete.id));
                    setSuccess('Deleted company default subcategory.');
                  }
                  setPendingDelete(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not delete company default taxonomy item.');
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

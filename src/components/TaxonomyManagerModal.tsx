import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import { asCategoryId } from '../types/ids';

export default function TaxonomyManagerModal(props: {
  opened: boolean;
  onClose: () => void;
  taxonomy: TaxonomyHook;
  readOnly?: boolean;
}) {
  const { opened, onClose, taxonomy, readOnly = false } = props;

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubNameByCat, setNewSubNameByCat] = useState<
    Record<string, string>
  >({});

  const categoryOptions = taxonomy.categoryOptions;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage categories & subcategories"
      size="lg"
    >
      <Stack gap="md">
        {readOnly && (
          <Text size="sm" c="dimmed">
            You don’t have permission to edit categories in this project.
          </Text>
        )}
        <Group align="flex-end">
          <TextInput
            label="Add category"
            placeholder="e.g. Travel"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.currentTarget.value)}
            style={{ flex: 1 }}
            disabled={readOnly}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            disabled={readOnly}
            onClick={() => {
              const name = newCategoryName.trim();
              if (!name) return;
              void taxonomy.addCategory(name);
              setNewCategoryName('');
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
              <Stack key={cat.id} gap="xs">
                <Group justify="space-between" align="flex-end">
                  <TextInput
                    label="Category"
                    value={cat.name}
                    onChange={(e) =>
                      taxonomy.renameCategory(cat.id, e.currentTarget.value)
                    }
                    style={{ flex: 1 }}
                    disabled={readOnly}
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    title="Delete category"
                    disabled={readOnly}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete category "${cat.name}"? This will remove its subcategories and un-code affected transactions.`
                        )
                      )
                        return;
                      taxonomy.deleteCategory(cat.id);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>

                <Group align="flex-end">
                  <TextInput
                    label="Add subcategory"
                    placeholder="e.g. Flights"
                    value={newSubNameByCat[cat.id] ?? ''}
                    onChange={(e) => {
                      // Defensive: in some environments/input methods the event target can be null.
                      // Avoid capturing the synthetic event inside the state updater.
                      const value = e?.currentTarget?.value ?? '';
                      setNewSubNameByCat((prev) => ({ ...prev, [cat.id]: value }));
                    }}
                    style={{ flex: 1 }}
                    disabled={readOnly}
                  />
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    disabled={readOnly}
                    onClick={() => {
                      const name = (newSubNameByCat[cat.id] ?? '').trim();
                      if (!name) return;
                      void taxonomy.addSubCategory(cat.id, name);
                      setNewSubNameByCat((prev) => ({ ...prev, [cat.id]: '' }));
                    }}
                  >
                    Add
                  </Button>
                </Group>

                {subcats.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No subcategories yet.
                  </Text>
                ) : (
                  <Stack gap={6}>
                    {subcats.map((sc) => (
                      <Group key={sc.id} align="flex-end" wrap="nowrap">
                        <TextInput
                          label="Subcategory"
                          value={sc.name}
                          onChange={(e) =>
                            taxonomy.renameSubCategory(
                              sc.id,
                              e?.currentTarget?.value ?? ''
                            )
                          }
                          style={{ flex: 1 }}
                          disabled={readOnly}
                        />
                        <Select
                          label="Move to"
                          data={categoryOptions}
                          value={sc.categoryId}
                          onChange={(v) => {
                            if (!v || v === sc.categoryId) return;
                            taxonomy.moveSubCategory(sc.id, asCategoryId(v));
                          }}
                          style={{ width: 220 }}
                          disabled={readOnly}
                        />
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title="Delete subcategory"
                          disabled={readOnly}
                          onClick={() => {
                            if (
                              !confirm(
                                `Delete subcategory "${sc.name}"? Transactions coded to it will become uncoded.`
                              )
                            )
                              return;
                            taxonomy.deleteSubCategory(sc.id);
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Stack>
    </Modal>
  );
}

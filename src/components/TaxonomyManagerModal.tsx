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
}) {
  const { opened, onClose, taxonomy } = props;

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
        <Group align="flex-end">
          <TextInput
            label="Add category"
            placeholder="e.g. Travel"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              const name = newCategoryName.trim();
              if (!name) return;
              taxonomy.addCategory(name);
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
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    title="Delete category"
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
                    onChange={(e) =>
                      setNewSubNameByCat((prev) => ({
                        ...prev,
                        [cat.id]: e.currentTarget.value,
                      }))
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => {
                      const name = (newSubNameByCat[cat.id] ?? '').trim();
                      if (!name) return;
                      taxonomy.addSubCategory(cat.id, name);
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
                        />
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title="Delete subcategory"
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

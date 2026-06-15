import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import type { CategoryId, ProjectId, SubCategoryId } from '../types';
import { asCategoryId, asSubCategoryId } from '../types';
import { useCategoriesQuery, useSubCategoriesQuery } from '../queries/taxonomy';
import {
  useCreateProjectAutoCodingRuleMutation,
  useDeleteProjectAutoCodingRuleMutation,
  useProjectAutoCodingRulesQuery,
  useUpdateProjectAutoCodingRuleMutation,
} from '../queries/projectAutoCodingRules';
import classes from '../styles/ui.module.css';

export default function ProjectAutoCodingRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  projectId: ProjectId;
  readOnly?: boolean;
}) {
  const { opened, onClose, projectId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const categoriesQ = useCategoriesQuery(projectId);
  const subCategoriesQ = useSubCategoriesQuery(projectId);
  const rulesQ = useProjectAutoCodingRulesQuery(projectId);
  const createRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const updateRule = useUpdateProjectAutoCodingRuleMutation(projectId);
  const deleteRule = useDeleteProjectAutoCodingRuleMutation(projectId);

  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const subCategories = useMemo(
    () => subCategoriesQ.data ?? [],
    [subCategoriesQ.data]
  );
  const rules = useMemo(() => rulesQ.data ?? [], [rulesQ.data]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories]
  );

  const [newMatchText, setNewMatchText] = useState('');
  const [newCategoryId, setNewCategoryId] = useState<CategoryId | null>(null);
  const [newSubCategoryId, setNewSubCategoryId] =
    useState<SubCategoryId | null>(null);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<
    Record<string, CategoryId>
  >({});
  const [subCategoryDrafts, setSubCategoryDrafts] = useState<
    Record<string, SubCategoryId>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const newSubCategoryOptions = useMemo(
    () =>
      subCategories
        .filter((subCategory) => subCategory.categoryId === newCategoryId)
        .map((subCategory) => ({
          value: subCategory.id,
          label: subCategory.name,
        })),
    [newCategoryId, subCategories]
  );

  async function moveRule(ruleId: string, direction: -1 | 1) {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
    if (currentIndex < 0) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const currentRule = rules[currentIndex];
    const targetRule = rules[targetIndex];
    if (!currentRule || !targetRule) return;

    try {
      setError(null);
      setSuccess(null);
      await updateRule.mutateAsync({
        id: currentRule.id,
        sortOrder: targetRule.sortOrder,
      });
      await updateRule.mutateAsync({
        id: targetRule.id,
        sortOrder: currentRule.sortOrder,
      });
      setSuccess(
        direction < 0
          ? 'Moved project auto-coding rule up.'
          : 'Moved project auto-coding rule down.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reorder project auto-coding rule.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Project Auto-Coding Rules"
      size={isMobile ? '100%' : 'xl'}
    >
      <Stack className={classes.modalStack}>
        {error ? <Alert color="red">{error}</Alert> : null}
        {success ? <Alert color="green">{success}</Alert> : null}

        {readOnly ? (
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            You don’t have permission to edit project auto-coding rules.
          </Text>
        ) : rulesQ.isPending && !rulesQ.data ? (
          <Text className={classes.emptyState}>
            Loading project auto-coding rules…
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed" className={classes.modalIntro}>
              Project auto-coding rules search transaction item and description
              text. The first matching rule wins and marks matching rows for
              approval during imports and other uncoded project flows.
            </Text>
            <Text size="xs" fw={600} c="dimmed" className="panelHelperText">
              Rules are checked from top to bottom. Keep broad matches lower so
              specific rules win first.
            </Text>
            <Group gap="sm" wrap="wrap">
              <Text size="xs" c="dimmed">
                {categories.length} categories
              </Text>
              <Text size="xs" c="dimmed">
                {subCategories.length} subcategories
              </Text>
              <Text size="xs" c="dimmed">
                {rules.length} project rules
              </Text>
            </Group>
          </Stack>
        )}

        <Paper withBorder radius="md" p="md" className={classes.modalCard}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Add Project Auto-Coding Rule</Text>
              <Badge variant="light">{rules.length} rules</Badge>
            </Group>
            <TextInput
              label="Match text"
              placeholder="e.g. uber, airport taxi, officeworks, flight"
              value={newMatchText}
              disabled={readOnly}
              onChange={(event) => {
                setError(null);
                setSuccess(null);
                setNewMatchText(event.currentTarget.value);
              }}
            />
            <Group grow align="flex-end">
              <Select
                label="Project category"
                data={categoryOptions}
                value={newCategoryId}
                disabled={readOnly}
                onChange={(value) => {
                  setError(null);
                  setSuccess(null);
                  setNewCategoryId(value ? asCategoryId(value) : null);
                  setNewSubCategoryId(null);
                }}
              />
              <Select
                label="Project subcategory"
                data={newSubCategoryOptions}
                value={newSubCategoryId}
                disabled={readOnly || !newCategoryId}
                onChange={(value) => {
                  setError(null);
                  setSuccess(null);
                  setNewSubCategoryId(value ? asSubCategoryId(value) : null);
                }}
              />
            </Group>
            <Group className={classes.footerRow}>
              <Button
                leftSection={<IconPlus size={16} />}
                disabled={
                  readOnly ||
                  createRule.isPending ||
                  !newMatchText.trim() ||
                  !newCategoryId ||
                  !newSubCategoryId
                }
                onClick={async () => {
                  if (!newCategoryId || !newSubCategoryId) return;
                  try {
                    setError(null);
                    setSuccess(null);
                    await createRule.mutateAsync({
                      matchText: newMatchText.trim(),
                      categoryId: newCategoryId,
                      subCategoryId: newSubCategoryId,
                    });
                    setNewMatchText('');
                    setNewCategoryId(null);
                    setNewSubCategoryId(null);
                    setSuccess('Added project auto-coding rule.');
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not add project auto-coding rule.'
                    );
                  }
                }}
              >
                Add rule
              </Button>
            </Group>
          </Stack>
        </Paper>

        {rules.length === 0 ? (
          <Text className={classes.emptyState}>
            No project auto-coding rules yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const selectedCategoryId =
                categoryDrafts[rule.id] ?? rule.categoryId;
              const subCategoryOptions = subCategories
                .filter(
                  (subCategory) => subCategory.categoryId === selectedCategoryId
                )
                .map((subCategory) => ({
                  value: subCategory.id,
                  label: subCategory.name,
                }));

              return (
                <Paper key={rule.id} withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Badge variant="light">Rule {index + 1}</Badge>
                      <Group gap="xs">
                        <ActionIcon
                          variant="subtle"
                          title="Move rule up"
                          disabled={readOnly || index === 0}
                          onClick={() => {
                            void moveRule(rule.id, -1);
                          }}
                        >
                          <IconArrowUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          title="Move rule down"
                          disabled={readOnly || index === rules.length - 1}
                          onClick={() => {
                            void moveRule(rule.id, 1);
                          }}
                        >
                          <IconArrowDown size={16} />
                        </ActionIcon>
                        {isMobile ? (
                          <Button
                            color="red"
                            variant="light"
                            leftSection={<IconTrash size={16} />}
                            disabled={readOnly}
                            onClick={async () => {
                              try {
                                setError(null);
                                setSuccess(null);
                                await deleteRule.mutateAsync(rule.id);
                                setSuccess('Deleted project auto-coding rule.');
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not delete project auto-coding rule.'
                                );
                              }
                            }}
                          >
                            Delete
                          </Button>
                        ) : (
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            title="Delete rule"
                            disabled={readOnly}
                            onClick={async () => {
                              try {
                                setError(null);
                                setSuccess(null);
                                await deleteRule.mutateAsync(rule.id);
                                setSuccess('Deleted project auto-coding rule.');
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not delete project auto-coding rule.'
                                );
                              }
                            }}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>

                    <TextInput
                      label="Match text"
                      description="Example: uber, airport taxi, officeworks, flight"
                      value={matchDrafts[rule.id] ?? rule.matchText}
                      disabled={readOnly}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setError(null);
                        setSuccess(null);
                        setMatchDrafts((current) => ({
                          ...current,
                          [rule.id]: value,
                        }));
                      }}
                      onBlur={() => {
                        const nextValue = (
                          matchDrafts[rule.id] ?? rule.matchText
                        ).trim();
                        if (!nextValue || nextValue === rule.matchText) return;
                        void updateRule
                          .mutateAsync({ id: rule.id, matchText: nextValue })
                          .then(() => {
                            setSuccess('Updated project auto-coding rule.');
                            setMatchDrafts((current) => {
                              const next = { ...current };
                              delete next[rule.id];
                              return next;
                            });
                          })
                          .catch((err) => {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not update project auto-coding rule.'
                            );
                          });
                      }}
                    />

                    <Group grow align="flex-end">
                      <Select
                        label="Category"
                        data={categoryOptions}
                        value={selectedCategoryId}
                        disabled={readOnly}
                        onChange={(value) => {
                          setError(null);
                          setSuccess(null);
                          setCategoryDrafts((current) => {
                            const next = { ...current };
                            if (value) next[rule.id] = asCategoryId(value);
                            else delete next[rule.id];
                            return next;
                          });
                          setSubCategoryDrafts((current) => {
                            const next = { ...current };
                            delete next[rule.id];
                            return next;
                          });
                        }}
                      />
                      <Select
                        label="Subcategory"
                        data={subCategoryOptions}
                        value={subCategoryDrafts[rule.id] ?? rule.subCategoryId}
                        disabled={readOnly || !selectedCategoryId}
                        onChange={async (value) => {
                          if (!value || !selectedCategoryId) return;
                          try {
                            setError(null);
                            setSuccess(null);
                            await updateRule.mutateAsync({
                              id: rule.id,
                              categoryId: selectedCategoryId,
                              subCategoryId: asSubCategoryId(value),
                            });
                            setCategoryDrafts((current) => {
                              const next = { ...current };
                              delete next[rule.id];
                              return next;
                            });
                            setSubCategoryDrafts((current) => {
                              const next = { ...current };
                              delete next[rule.id];
                              return next;
                            });
                            setSuccess('Updated project auto-coding rule.');
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not update project auto-coding rule.'
                            );
                          }
                        }}
                      />
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

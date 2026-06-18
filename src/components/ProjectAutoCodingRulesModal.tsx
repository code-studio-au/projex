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

import type { CategoryId, CompanyId, ProjectId, SubCategoryId } from '../types';
import { asCategoryId, asSubCategoryId } from '../types';
import { useCategoriesQuery, useSubCategoriesQuery } from '../queries/taxonomy';
import {
  useBackfillProjectCodingMutation,
  useCreateProjectAutoCodingRuleMutation,
  useDeleteProjectAutoCodingRuleMutation,
  useProjectAutoCodingRulesQuery,
  usePromoteProjectRuleToCompanyDefaultMutation,
  useUpdateProjectAutoCodingRuleMutation,
} from '../queries/projectAutoCodingRules';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import {
  describeProjectStandard,
  getProjectStandardBadge,
  isInheritedCompanyStandard,
  summarizeProjectStandardStates,
} from '../utils/projectStandards';
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import classes from '../styles/ui.module.css';

export default function ProjectAutoCodingRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  projectId: ProjectId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, projectId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const access = useCompanyAccess(companyId);
  const canPromoteToCompanyDefaults = access.can('company:manage_defaults');

  const categoriesQ = useCategoriesQuery(projectId);
  const subCategoriesQ = useSubCategoriesQuery(projectId);
  const rulesQ = useProjectAutoCodingRulesQuery(projectId);
  const createRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const updateRule = useUpdateProjectAutoCodingRuleMutation(projectId);
  const deleteRule = useDeleteProjectAutoCodingRuleMutation(projectId);
  const backfill = useBackfillProjectCodingMutation(projectId);
  const promoteRule = usePromoteProjectRuleToCompanyDefaultMutation(projectId);

  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const subCategories = useMemo(
    () => subCategoriesQ.data ?? [],
    [subCategoriesQ.data]
  );
  const rules = useMemo(() => rulesQ.data ?? [], [rulesQ.data]);
  const ruleStateSummary = useMemo(
    () => summarizeProjectStandardStates(rules),
    [rules]
  );

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
      fullScreen={isMobile}
      centered={!isMobile}
      size="xl"
      lockScroll={false}
      styles={{
        body: {
          maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
          overflowY: 'auto',
        },
      }}
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
              Project rules search transaction item and description text.
              Project-specific rules run first, then inherited company rules
              apply when their target taxonomy exists in this project.
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
                {ruleStateSummary.local} project rules
              </Text>
              <Text size="xs" c="dimmed">
                {ruleStateSummary.inherited} inherited company rules
              </Text>
              {ruleStateSummary.overridden > 0 ? (
                <Text size="xs" c="dimmed">
                  {ruleStateSummary.overridden} overrides
                </Text>
              ) : null}
              {ruleStateSummary.detached > 0 ? (
                <Text size="xs" c="dimmed">
                  {ruleStateSummary.detached} detached
                </Text>
              ) : null}
            </Group>
            <Group gap="sm" wrap="wrap">
              <Button
                variant="light"
                size="xs"
                loading={backfill.isPending}
                disabled={readOnly}
                onClick={async () => {
                  try {
                    setError(null);
                    setSuccess(null);
                    const result = await backfill.mutateAsync({ mode: 'all' });
                    setSuccess(
                      result.updatedCount === 0
                        ? 'No uncoded transactions matched current company or project rules.'
                        : `Backfilled ${result.updatedCount} uncoded transactions (${result.projectRuleMatches} project-rule, ${result.companyRuleMatches} company-rule matches).`
                    );
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not backfill uncoded transactions.'
                    );
                  }
                }}
              >
                Backfill uncoded transactions
              </Button>
            </Group>
          </Stack>
        )}

        <Paper withBorder radius="md" p="md" className={classes.modalCard}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Add Project Auto-Coding Rule</Text>
              <Badge variant="light">{ruleStateSummary.local} rules</Badge>
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
                {...firefoxSafeModalSelectProps}
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
                {...firefoxSafeModalSelectProps}
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
            No effective auto-coding rules yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const isInherited = isInheritedCompanyStandard(rule);
              const sourceBadge = getProjectStandardBadge(rule);
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
              const canMoveUp =
                index > 0 && rules[index - 1]?.syncStatus === rule.syncStatus;
              const canMoveDown =
                index < rules.length - 1 &&
                rules[index + 1]?.syncStatus === rule.syncStatus;

              return (
                <Paper key={rule.id} withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Group gap="xs" wrap="wrap">
                        <Badge variant="light">Rule {index + 1}</Badge>
                        <Badge variant="light" color={sourceBadge.color}>
                          {sourceBadge.label}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <ActionIcon
                          variant="subtle"
                          title="Move rule up"
                          disabled={readOnly || !canMoveUp}
                          onClick={() => {
                            void moveRule(rule.id, -1);
                          }}
                        >
                          <IconArrowUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          title="Move rule down"
                          disabled={readOnly || !canMoveDown}
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
                            disabled={readOnly || isInherited}
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
                            disabled={readOnly || isInherited}
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
                    {canPromoteToCompanyDefaults && !isInherited ? (
                      <Group justify="flex-end">
                        <Button
                          variant="subtle"
                          size="xs"
                          disabled={readOnly || promoteRule.isPending}
                          onClick={async () => {
                            try {
                              setError(null);
                              setSuccess(null);
                              const result = await promoteRule.mutateAsync({
                                ruleId: rule.id,
                              });
                              setSuccess(
                                result.ruleCreated
                                  ? 'Promoted project rule to company defaults.'
                                  : 'Matching company default rule already existed; project rule is now aligned.'
                              );
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not promote project rule.'
                              );
                            }
                          }}
                        >
                          Promote to company default rule
                        </Button>
                      </Group>
                    ) : null}

                    <Text size="xs" c="dimmed">
                      {describeProjectStandard(rule)}
                    </Text>

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
                        {...firefoxSafeModalSelectProps}
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
                        {...firefoxSafeModalSelectProps}
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

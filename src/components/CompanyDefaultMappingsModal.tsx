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

import type {
  CompanyDefaultCategoryId,
  CompanyDefaultSubCategoryId,
  CompanyId,
} from '../types';
import {
  useCompanyDefaultsQuery,
  useCreateCompanyDefaultMappingRuleMutation,
  useDeleteCompanyDefaultMappingRuleMutation,
  useUpdateCompanyDefaultMappingRuleMutation,
} from '../queries/taxonomy';

export default function CompanyDefaultMappingsModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const createRule = useCreateCompanyDefaultMappingRuleMutation(companyId);
  const updateRule = useUpdateCompanyDefaultMappingRuleMutation(companyId);
  const deleteRule = useDeleteCompanyDefaultMappingRuleMutation(companyId);

  const categories = useMemo(
    () => companyDefaultsQ.data?.categories ?? [],
    [companyDefaultsQ.data]
  );
  const subCategories = useMemo(
    () => companyDefaultsQ.data?.subCategories ?? [],
    [companyDefaultsQ.data]
  );
  const rules = companyDefaultsQ.data?.mappingRules ?? [];

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories]
  );

  const [newMatchText, setNewMatchText] = useState('');
  const [newCategoryId, setNewCategoryId] =
    useState<CompanyDefaultCategoryId | null>(null);
  const [newSubCategoryId, setNewSubCategoryId] = useState<string | null>(null);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>(
    {}
  );
  const [subCategoryDrafts, setSubCategoryDrafts] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const newSubCategoryOptions = useMemo(
    () =>
      subCategories
        .filter(
          (subCategory) =>
            subCategory.companyDefaultCategoryId === newCategoryId
        )
        .map((subCategory) => ({
          value: subCategory.id,
          label: subCategory.name,
        })),
    [newCategoryId, subCategories]
  );
  const hasDefaultTaxonomy = categories.length > 0 && subCategories.length > 0;

  async function moveRule(ruleId: string, direction: -1 | 1) {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
    if (currentIndex < 0) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const currentRule = rules[currentIndex];
    const targetRule = rules[targetIndex];

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
        direction < 0 ? 'Moved mapping rule up.' : 'Moved mapping rule down.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reorder company default mapping.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage company default mappings"
      size={isMobile ? '100%' : 'xl'}
    >
      <Stack gap="md">
        {error ? <Alert color="red">{error}</Alert> : null}
        {success ? <Alert color="green">{success}</Alert> : null}
        {readOnly ? (
          <Text size="sm" c="dimmed" className="panelHelperText">
            You don’t have permission to edit company default mappings.
          </Text>
        ) : companyDefaultsQ.isPending && !companyDefaultsQ.data ? (
          <Text size="sm" c="dimmed" className="panelHelperText">
            Loading company default mappings…
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed" className="panelHelperText">
              Rules search imported transaction item and description text. The
              first matching rule wins and auto-codes the row if the project
              already contains the mapped company defaults.
            </Text>
            <Text size="xs" fw={600} c="dimmed" className="panelHelperText">
              Rules are checked from top to bottom. The top rule wins first.
            </Text>
            <Text size="xs" c="dimmed" className="panelHelperText">
              Example matches: <strong>uber</strong>,{' '}
              <strong>airport taxi</strong>, <strong>officeworks</strong>,{' '}
              <strong>flight</strong>.
            </Text>
            <Text size="xs" c="dimmed" className="panelHelperText">
              Matching is case-insensitive and handles simple singular/plural
              variations like <strong>flight</strong> and{' '}
              <strong>flights</strong>.
            </Text>
            <Group gap="sm" wrap="wrap">
              <Text size="xs" fw={600} c="dimmed">
                Current defaults:
              </Text>
              <Text size="xs" c="dimmed">
                {categories.length} categories
              </Text>
              <Text size="xs" c="dimmed">
                {subCategories.length} subcategories
              </Text>
              <Text size="xs" c="dimmed">
                {rules.length} mapping rules
              </Text>
            </Group>
          </Stack>
        )}

        {!readOnly && !hasDefaultTaxonomy ? (
          <Alert color="blue">
            Add company default categories and subcategories first. Mapping
            rules need default taxonomy to point at.
          </Alert>
        ) : null}

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Add default mapping</Text>
              <Badge variant="light">{rules.length} rules</Badge>
            </Group>
            <TextInput
              label="Match text"
              placeholder="e.g. uber, airport taxi, officeworks, flight"
              value={newMatchText}
              disabled={readOnly}
              onChange={(e) => {
                setError(null);
                setSuccess(null);
                setNewMatchText(e.currentTarget.value);
              }}
            />
            <Group grow align="flex-end">
              <Select
                label="Company default category"
                data={categoryOptions}
                value={newCategoryId}
                disabled={readOnly}
                onChange={(value) => {
                  setError(null);
                  setSuccess(null);
                  setNewCategoryId(
                    (value as CompanyDefaultCategoryId | null) ?? null
                  );
                  setNewSubCategoryId(null);
                }}
              />
              <Select
                label="Company default subcategory"
                data={newSubCategoryOptions}
                value={newSubCategoryId}
                disabled={readOnly || !newCategoryId}
                onChange={(value) => {
                  setError(null);
                  setSuccess(null);
                  setNewSubCategoryId(value);
                }}
              />
            </Group>
            {!newCategoryId && hasDefaultTaxonomy ? (
              <Text size="xs" c="dimmed">
                Choose a category first, then pick the matching default
                subcategory.
              </Text>
            ) : null}
            {newCategoryId && newSubCategoryOptions.length === 0 ? (
              <Text size="xs" c="dimmed">
                This category has no default subcategories yet. Add one in
                company default categories first.
              </Text>
            ) : null}
            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                disabled={
                  readOnly ||
                  createRule.isPending ||
                  !hasDefaultTaxonomy ||
                  !newMatchText.trim() ||
                  !newCategoryId ||
                  !newSubCategoryId
                }
                onClick={async () => {
                  try {
                    setError(null);
                    setSuccess(null);
                    await createRule.mutateAsync({
                      companyId,
                      matchText: newMatchText.trim(),
                      companyDefaultCategoryId:
                        newCategoryId as CompanyDefaultCategoryId,
                      companyDefaultSubCategoryId:
                        newSubCategoryId as CompanyDefaultSubCategoryId,
                      sortOrder: rules.length,
                    });
                    setNewMatchText('');
                    setNewCategoryId(null);
                    setNewSubCategoryId(null);
                    setSuccess('Added company default mapping.');
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not add company default mapping.'
                    );
                  }
                }}
              >
                Add mapping
              </Button>
            </Group>
          </Stack>
        </Paper>

        {rules.length === 0 ? (
          <Text size="sm" c="dimmed" className="panelHelperText">
            No company default mappings yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const selectedCategoryId =
                (categoryDrafts[rule.id] as
                  | CompanyDefaultCategoryId
                  | undefined) ?? rule.companyDefaultCategoryId;
              const subCategoryOptions = subCategories
                .filter(
                  (subCategory) =>
                    subCategory.companyDefaultCategoryId === selectedCategoryId
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
                                setSuccess('Deleted company default mapping.');
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not delete company default mapping.'
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
                            title="Delete mapping"
                            disabled={readOnly}
                            onClick={async () => {
                              try {
                                setError(null);
                                setSuccess(null);
                                await deleteRule.mutateAsync(rule.id);
                                setSuccess('Deleted company default mapping.');
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not delete company default mapping.'
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
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setError(null);
                        setSuccess(null);
                        setMatchDrafts((prev) => ({
                          ...prev,
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
                            setSuccess('Updated company default mapping.');
                            setMatchDrafts((prev) => {
                              const next = { ...prev };
                              delete next[rule.id];
                              return next;
                            });
                          })
                          .catch((err) => {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not update company default mapping.'
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
                          setCategoryDrafts((prev) => ({
                            ...prev,
                            [rule.id]: value ?? '',
                          }));
                          setSubCategoryDrafts((prev) => ({
                            ...prev,
                            [rule.id]: '',
                          }));
                        }}
                      />
                      <Select
                        label="Subcategory"
                        data={subCategoryOptions}
                        value={
                          subCategoryDrafts[rule.id] ??
                          rule.companyDefaultSubCategoryId
                        }
                        disabled={readOnly || !selectedCategoryId}
                        onChange={async (value) => {
                          if (!value || !selectedCategoryId) return;
                          try {
                            setError(null);
                            setSuccess(null);
                            await updateRule.mutateAsync({
                              id: rule.id,
                              companyDefaultCategoryId: selectedCategoryId,
                              companyDefaultSubCategoryId:
                                value as CompanyDefaultSubCategoryId,
                            });
                            setCategoryDrafts((prev) => {
                              const next = { ...prev };
                              delete next[rule.id];
                              return next;
                            });
                            setSubCategoryDrafts((prev) => {
                              const next = { ...prev };
                              delete next[rule.id];
                              return next;
                            });
                            setSuccess('Updated company default mapping.');
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not update company default mapping.'
                            );
                          }
                        }}
                      />
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
            <Text size="xs" c="dimmed" className="panelHelperText">
              Priority runs from top to bottom. Move broader matches lower so
              specific rules win first.
            </Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

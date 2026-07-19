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
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowDown,
  IconArrowUp,
  IconBuildingBank,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import type {
  CompanyId,
  ImportRule,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
  ProjectId,
} from '../types';
import {
  useCreateProjectImportRuleMutation,
  useDeleteProjectImportRuleMutation,
  useProjectImportRulesQuery,
  usePromoteProjectImportRuleMutation,
  useUpdateProjectImportRuleMutation,
} from '../queries/importRules';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import {
  getProjectStandardBadge,
  isInheritedCompanyStandard,
  summarizeProjectStandardStates,
} from '../utils/projectStandards';
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import classes from '../styles/ui.module.css';

const actionOptions: Array<{ value: ImportRuleAction; label: string }> = [
  { value: 'exclude', label: 'Exclude' },
  { value: 'review', label: 'Send to project review' },
  { value: 'import', label: 'Import' },
];

const fieldOptions: Array<{ value: ImportRuleField; label: string }> = [
  { value: 'ledger', label: 'Ledger' },
  { value: 'source', label: 'Source' },
  { value: 'journalId', label: 'Journal ID' },
  { value: 'journalLineDescription', label: 'Journal Line Description' },
  { value: 'ccAndDescription', label: 'CC and Description' },
  { value: 'vendorName', label: 'Vendor Name' },
  { value: 'poId', label: 'PO ID' },
  { value: 'referenceNum', label: 'Reference Num' },
  { value: 'anyText', label: 'Any source text' },
];

const operatorOptions: Array<{ value: ImportRuleOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'equals_any', label: 'Equals any of' },
  { value: 'contains', label: 'Contains' },
  { value: 'contains_any', label: 'Contains any of' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'starts_with_any', label: 'Starts with any of' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'ends_with_any', label: 'Ends with any of' },
];

function toImportRuleAction(value: string | null): ImportRuleAction | null {
  return actionOptions.some((option) => option.value === value)
    ? (value as ImportRuleAction)
    : null;
}

function toImportRuleField(value: string | null): ImportRuleField | null {
  return fieldOptions.some((option) => option.value === value)
    ? (value as ImportRuleField)
    : null;
}

function toImportRuleOperator(value: string | null): ImportRuleOperator | null {
  return operatorOptions.some((option) => option.value === value)
    ? (value as ImportRuleOperator)
    : null;
}

export default function ProjectImportRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  projectId: ProjectId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, projectId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const access = useCompanyAccess(companyId);
  const canPromoteToCompanyRules = access.can('company:manage_defaults');

  const importRulesQ = useProjectImportRulesQuery(projectId);
  const createRule = useCreateProjectImportRuleMutation(companyId, projectId);
  const updateRule = useUpdateProjectImportRuleMutation(companyId, projectId);
  const deleteRule = useDeleteProjectImportRuleMutation(companyId, projectId);
  const promoteRule = usePromoteProjectImportRuleMutation(companyId, projectId);

  const rules = useMemo(() => importRulesQ.data ?? [], [importRulesQ.data]);
  const ruleStateSummary = useMemo(
    () => summarizeProjectStandardStates(rules),
    [rules]
  );

  const [newName, setNewName] = useState('');
  const [newAction, setNewAction] = useState<ImportRuleAction>('exclude');
  const [newField, setNewField] = useState<ImportRuleField>('source');
  const [newOperator, setNewOperator] = useState<ImportRuleOperator>('equals');
  const [newValue, setNewValue] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ImportRule>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  function draftFor(rule: ImportRule): ImportRule {
    return drafts[rule.id] ?? rule;
  }

  function patchDraft(rule: ImportRule, patch: Partial<ImportRule>) {
    clearFeedback();
    setDrafts((current) => ({
      ...current,
      [rule.id]: { ...draftFor(rule), ...patch },
    }));
  }

  async function saveRule(rule: ImportRule) {
    const draft = draftFor(rule);
    try {
      clearFeedback();
      const updated = await updateRule.mutateAsync({
        id: rule.id,
        name: draft.name,
        action: draft.action,
        field: draft.field,
        operator: draft.operator,
        value: draft.value,
        enabled: draft.enabled,
        sortOrder: draft.sortOrder,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
      setSuccess(`Updated ${updated.name}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update import rule.'
      );
    }
  }

  async function moveRule(ruleId: ImportRule['id'], direction: -1 | 1) {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
    if (currentIndex < 0) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const currentRule = rules[currentIndex];
    const targetRule = rules[targetIndex];
    if (!currentRule || !targetRule) return;

    try {
      clearFeedback();
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
          ? 'Moved project import rule up.'
          : 'Moved project import rule down.'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reorder project import rule.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Project Import Rules"
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
            You don’t have permission to edit project import rules.
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed" className={classes.modalIntro}>
              Project import rules apply only within this project. They run
              before company import rules so project-specific exclusions and
              review rules can override broader company defaults when needed.
            </Text>
            <Text size="xs" c="dimmed">
              For any "any of" operator, separate values with commas or new
              lines.
            </Text>
            <Text size="xs" fw={600} c="dimmed">
              Rules are checked from top to bottom. The first enabled project
              match wins before company rules are evaluated.
            </Text>
          </Stack>
        )}

        <Paper withBorder radius="md" p="md" className={classes.modalCard}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Add Project Import Rule</Text>
              <Group gap="xs">
                <Badge variant="light">{rules.length} rules</Badge>
                {ruleStateSummary.companyBacked > 0 ? (
                  <Badge variant="light" color="teal">
                    {ruleStateSummary.companyBacked} company-backed
                  </Badge>
                ) : null}
              </Group>
            </Group>
            <TextInput
              label="Rule name"
              placeholder="e.g. Exclude shared service recharge rows"
              value={newName}
              disabled={readOnly}
              onChange={(event) => {
                clearFeedback();
                setNewName(event.currentTarget.value);
              }}
            />
            <Group grow align="flex-end">
              <Select
                label="Action"
                data={actionOptions}
                value={newAction}
                disabled={readOnly}
                {...firefoxSafeModalSelectProps}
                onChange={(value) => {
                  const next = toImportRuleAction(value);
                  if (next) setNewAction(next);
                }}
              />
              <Select
                label="Field"
                data={fieldOptions}
                value={newField}
                disabled={readOnly}
                {...firefoxSafeModalSelectProps}
                onChange={(value) => {
                  const next = toImportRuleField(value);
                  if (next) setNewField(next);
                }}
              />
              <Select
                label="Match"
                data={operatorOptions}
                value={newOperator}
                disabled={readOnly}
                {...firefoxSafeModalSelectProps}
                onChange={(value) => {
                  const next = toImportRuleOperator(value);
                  if (next) setNewOperator(next);
                }}
              />
            </Group>
            <TextInput
              label="Value"
              placeholder="e.g. payroll, SAL, recharge"
              value={newValue}
              disabled={readOnly}
              onChange={(event) => {
                clearFeedback();
                setNewValue(event.currentTarget.value);
              }}
            />
            <Group className={classes.footerRow}>
              <Button
                leftSection={<IconPlus size={16} />}
                disabled={
                  readOnly ||
                  createRule.isPending ||
                  !newName.trim() ||
                  !newValue.trim()
                }
                onClick={async () => {
                  try {
                    clearFeedback();
                    await createRule.mutateAsync({
                      companyId,
                      projectId,
                      scope: 'project',
                      name: newName.trim(),
                      action: newAction,
                      field: newField,
                      operator: newOperator,
                      value: newValue.trim(),
                      sortOrder: rules.length
                        ? Math.max(...rules.map((rule) => rule.sortOrder)) + 10
                        : 10,
                      enabled: true,
                    });
                    setNewName('');
                    setNewAction('exclude');
                    setNewField('source');
                    setNewOperator('equals');
                    setNewValue('');
                    setSuccess('Added project import rule.');
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not add project import rule.'
                    );
                  }
                }}
              >
                Add rule
              </Button>
            </Group>
          </Stack>
        </Paper>

        {importRulesQ.isPending && !importRulesQ.data ? (
          <Text className={classes.emptyState}>
            Loading project import rules…
          </Text>
        ) : rules.length === 0 ? (
          <Text className={classes.emptyState}>
            No project import rules yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const draft = draftFor(rule);
              const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
              const sourceBadge = getProjectStandardBadge(rule);
              const canDeleteRule = !isInheritedCompanyStandard(rule);
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
                        <Badge
                          variant="light"
                          color={draft.enabled ? 'green' : 'gray'}
                        >
                          {draft.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Badge
                          variant="light"
                          color={
                            draft.action === 'exclude'
                              ? 'gray'
                              : draft.action === 'review'
                                ? 'yellow'
                                : 'blue'
                          }
                        >
                          {draft.action}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        {canPromoteToCompanyRules ? (
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<IconBuildingBank size={14} />}
                            disabled={
                              readOnly || isInheritedCompanyStandard(rule)
                            }
                            loading={promoteRule.isPending}
                            onClick={async () => {
                              try {
                                clearFeedback();
                                const promoted = await promoteRule.mutateAsync(
                                  rule.id
                                );
                                setSuccess(
                                  `Promoted "${rule.name}" to company import rules as "${promoted.name}".`
                                );
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not promote project import rule.'
                                );
                              }
                            }}
                          >
                            Promote
                          </Button>
                        ) : null}
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
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title="Delete project import rule"
                          disabled={readOnly || !canDeleteRule}
                          onClick={async () => {
                            try {
                              clearFeedback();
                              await deleteRule.mutateAsync(rule.id);
                              setSuccess('Deleted project import rule.');
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not delete project import rule.'
                              );
                            }
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>

                    {rule.originScope === 'company' ? (
                      <Text size="xs" c="dimmed">
                        {rule.syncStatus === 'inherited'
                          ? 'Synced from company. Edit here only when this project needs a local exception.'
                          : rule.syncStatus === 'overridden'
                            ? 'This started from a company rule and now behaves as a project-only override.'
                            : 'This was originally synced from company, but the company source no longer exists.'}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Project-only rule. Promote it when the same import
                        handling should apply across the company.
                      </Text>
                    )}

                    <TextInput
                      label="Rule name"
                      value={draft.name}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchDraft(rule, { name: event.currentTarget.value })
                      }
                    />
                    <Group grow align="flex-end">
                      <Select
                        label="Action"
                        data={actionOptions}
                        value={draft.action}
                        disabled={readOnly}
                        {...firefoxSafeModalSelectProps}
                        onChange={(value) => {
                          const next = toImportRuleAction(value);
                          if (next) patchDraft(rule, { action: next });
                        }}
                      />
                      <Select
                        label="Field"
                        data={fieldOptions}
                        value={draft.field}
                        disabled={readOnly}
                        {...firefoxSafeModalSelectProps}
                        onChange={(value) => {
                          const next = toImportRuleField(value);
                          if (next) patchDraft(rule, { field: next });
                        }}
                      />
                      <Select
                        label="Match"
                        data={operatorOptions}
                        value={draft.operator}
                        disabled={readOnly}
                        {...firefoxSafeModalSelectProps}
                        onChange={(value) => {
                          const next = toImportRuleOperator(value);
                          if (next) patchDraft(rule, { operator: next });
                        }}
                      />
                    </Group>
                    <TextInput
                      label="Value"
                      value={draft.value}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchDraft(rule, { value: event.currentTarget.value })
                      }
                    />
                    <Group justify="space-between" align="center">
                      <Switch
                        label="Enabled"
                        checked={draft.enabled}
                        disabled={readOnly}
                        onChange={(event) =>
                          patchDraft(rule, {
                            enabled: event.currentTarget.checked,
                          })
                        }
                      />
                      <Group gap="xs">
                        {dirty ? (
                          <Button
                            variant="subtle"
                            color="gray"
                            disabled={readOnly}
                            onClick={() =>
                              setDrafts((current) => {
                                const next = { ...current };
                                delete next[rule.id];
                                return next;
                              })
                            }
                          >
                            Reset
                          </Button>
                        ) : null}
                        <Button
                          disabled={readOnly || !dirty}
                          loading={updateRule.isPending}
                          onClick={() => {
                            void saveRule(rule);
                          }}
                        >
                          Save
                        </Button>
                      </Group>
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

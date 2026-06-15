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
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import type {
  CompanyId,
  ImportRule,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
} from '../types';
import {
  useCreateImportRuleMutation,
  useDeleteImportRuleMutation,
  useImportRulesQuery,
  useUpdateImportRuleMutation,
} from '../queries/importRules';
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

export default function CompanyImportRulesModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const importRulesQ = useImportRulesQuery(companyId);
  const createRule = useCreateImportRuleMutation(companyId);
  const updateRule = useUpdateImportRuleMutation(companyId);
  const deleteRule = useDeleteImportRuleMutation(companyId);

  const rules = useMemo(() => importRulesQ.data ?? [], [importRulesQ.data]);

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
        err instanceof Error ? err.message : 'Could not update Import Rule.'
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
        direction < 0 ? 'Moved Import Rule up.' : 'Moved Import Rule down.'
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reorder Import Rule.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Import Rules"
      fullScreen={isMobile}
      centered={!isMobile}
      size="xl"
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
            You don’t have permission to edit Import Rules.
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed" className={classes.modalIntro}>
              Import Rules run before Auto-Categorise Rules. Use them to exclude
              known non-project spend, or to hold uncertain rows for project
              review.
            </Text>
            <Text size="xs" c="dimmed">
              For any "any of" operator, separate values with commas or new
              lines.
            </Text>
            <Text size="xs" fw={600} c="dimmed">
              Rules are checked from top to bottom. The first enabled match
              wins.
            </Text>
          </Stack>
        )}

        <Paper withBorder radius="md" p="md" className={classes.modalCard}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Add Import Rule</Text>
              <Badge variant="light">{rules.length} rules</Badge>
            </Group>
            <TextInput
              label="Rule name"
              placeholder="e.g. Exclude SAL payroll source"
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
                comboboxProps={{ withinPortal: false }}
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
                comboboxProps={{ withinPortal: false }}
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
                comboboxProps={{ withinPortal: false }}
                onChange={(value) => {
                  const next = toImportRuleOperator(value);
                  if (next) setNewOperator(next);
                }}
              />
            </Group>
            <TextInput
              label="Value"
              placeholder="e.g. SAL, EXA, payroll, ^(4041|4141)\\b"
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
                    setSuccess('Added Import Rule.');
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not add Import Rule.'
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
          <Text className={classes.emptyState}>Loading Import Rules…</Text>
        ) : rules.length === 0 ? (
          <Text className={classes.emptyState}>No Import Rules yet.</Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const draft = draftFor(rule);
              const dirty = JSON.stringify(draft) !== JSON.stringify(rule);

              return (
                <Paper key={rule.id} withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Group gap="xs" wrap="wrap">
                        <Badge variant="light">Rule {index + 1}</Badge>
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
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title="Delete Import Rule"
                          disabled={readOnly}
                          onClick={async () => {
                            try {
                              clearFeedback();
                              await deleteRule.mutateAsync(rule.id);
                              setSuccess('Deleted Import Rule.');
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not delete Import Rule.'
                              );
                            }
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>

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
                        comboboxProps={{ withinPortal: false }}
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
                        comboboxProps={{ withinPortal: false }}
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
                        comboboxProps={{ withinPortal: false }}
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

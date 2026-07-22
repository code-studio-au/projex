import { useState } from 'react';
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
  ImportRule,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
} from '../types';
import {
  getProjectStandardBadge,
  isInheritedCompanyStandard,
  summarizeProjectStandardStates,
} from '../utils/projectStandards';
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import {
  canMoveImportRule,
  importRuleActionOptions,
  importRuleDraftIsDirty,
  importRuleFieldOptions,
  importRuleOperatorOptions,
  nextImportRuleSortOrder,
  toImportRuleAction,
  toImportRuleField,
  toImportRuleOperator,
} from './importRuleEditorModel';
import classes from '../styles/ui.module.css';

type ImportRuleEditorDraft = Pick<
  ImportRule,
  'name' | 'action' | 'field' | 'operator' | 'value' | 'enabled' | 'sortOrder'
>;

export type ImportRulesEditorAdapter = {
  scope: 'company' | 'project';
  rules: ImportRule[];
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  promoting?: boolean;
  canPromote?: boolean;
  create: (draft: ImportRuleEditorDraft) => Promise<ImportRule>;
  update: (
    draft: Partial<ImportRuleEditorDraft> & { id: ImportRule['id'] }
  ) => Promise<ImportRule>;
  delete: (ruleId: ImportRule['id']) => Promise<unknown>;
  promote?: (ruleId: ImportRule['id']) => Promise<ImportRule>;
};

export default function ImportRulesEditorModal(props: {
  opened: boolean;
  onClose: () => void;
  adapter: ImportRulesEditorAdapter;
  readOnly?: boolean;
}) {
  const { opened, onClose, adapter, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const projectScoped = adapter.scope === 'project';
  const rules = adapter.rules;
  const ruleStateSummary = summarizeProjectStandardStates(rules);

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
      const updated = await adapter.update({
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
      await adapter.update({
        id: currentRule.id,
        sortOrder: targetRule.sortOrder,
      });
      await adapter.update({
        id: targetRule.id,
        sortOrder: currentRule.sortOrder,
      });
      setSuccess(
        direction < 0 ? 'Moved import rule up.' : 'Moved import rule down.'
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reorder import rule.'
      );
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        projectScoped
          ? 'Manage Project Import Rules'
          : 'Manage Company Import Rules'
      }
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
            You don’t have permission to edit import rules.
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed" className={classes.modalIntro}>
              {projectScoped
                ? 'Project import rules apply only within this project. They run before company import rules so project-specific handling can override broader company defaults.'
                : 'Import rules run before auto-categorise rules. Use them to exclude known non-project spend or require an explicit preview decision for uncertain rows.'}
            </Text>
            <Text size="xs" c="dimmed">
              For any "any of" operator, separate values with commas or new
              lines.
            </Text>
            <Text size="xs" fw={600} c="dimmed">
              Rules are checked from top to bottom. The first enabled match wins
              {projectScoped ? ' before company rules are evaluated' : ''}.
            </Text>
          </Stack>
        )}

        <Paper withBorder radius="md" p="md" className={classes.modalCard}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>
                Add {projectScoped ? 'Project ' : ''}Import Rule
              </Text>
              <Group gap="xs">
                <Badge variant="light">{rules.length} rules</Badge>
                {projectScoped && ruleStateSummary.companyBacked > 0 ? (
                  <Badge variant="light" color="teal">
                    {ruleStateSummary.companyBacked} company-backed
                  </Badge>
                ) : null}
              </Group>
            </Group>
            <TextInput
              label="Rule name"
              placeholder={
                projectScoped
                  ? 'e.g. Exclude shared service recharge rows'
                  : 'e.g. Exclude SAL payroll source'
              }
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
                data={importRuleActionOptions}
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
                data={importRuleFieldOptions}
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
                data={importRuleOperatorOptions}
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
              placeholder={
                projectScoped
                  ? 'e.g. payroll, SAL, recharge'
                  : 'e.g. SAL, EXA, payroll'
              }
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
                  adapter.creating ||
                  !newName.trim() ||
                  !newValue.trim()
                }
                onClick={async () => {
                  try {
                    clearFeedback();
                    await adapter.create({
                      name: newName.trim(),
                      action: newAction,
                      field: newField,
                      operator: newOperator,
                      value: newValue.trim(),
                      sortOrder: nextImportRuleSortOrder(rules),
                      enabled: true,
                    });
                    setNewName('');
                    setNewAction('exclude');
                    setNewField('source');
                    setNewOperator('equals');
                    setNewValue('');
                    setSuccess('Added import rule.');
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Could not add import rule.'
                    );
                  }
                }}
              >
                Add rule
              </Button>
            </Group>
          </Stack>
        </Paper>

        {adapter.loading && rules.length === 0 ? (
          <Text className={classes.emptyState}>Loading import rules…</Text>
        ) : rules.length === 0 ? (
          <Text className={classes.emptyState}>No import rules yet.</Text>
        ) : (
          <Stack gap="sm">
            {rules.map((rule, index) => {
              const draft = draftFor(rule);
              const dirty = importRuleDraftIsDirty(rule, draft);
              const sourceBadge = projectScoped
                ? getProjectStandardBadge(rule)
                : null;
              const canDeleteRule =
                !projectScoped || !isInheritedCompanyStandard(rule);
              const canMoveUp = canMoveImportRule({
                rules,
                index,
                direction: -1,
                scope: adapter.scope,
              });
              const canMoveDown = canMoveImportRule({
                rules,
                index,
                direction: 1,
                scope: adapter.scope,
              });
              const promoteRule = adapter.promote;

              return (
                <Paper key={rule.id} withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Group gap="xs" wrap="wrap">
                        <Badge variant="light">Rule {index + 1}</Badge>
                        {sourceBadge ? (
                          <Badge variant="light" color={sourceBadge.color}>
                            {sourceBadge.label}
                          </Badge>
                        ) : null}
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
                        {projectScoped && adapter.canPromote && promoteRule ? (
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<IconBuildingBank size={14} />}
                            disabled={
                              readOnly || isInheritedCompanyStandard(rule)
                            }
                            loading={adapter.promoting}
                            onClick={async () => {
                              try {
                                clearFeedback();
                                const promoted = await promoteRule(rule.id);
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
                          title={`Delete ${projectScoped ? 'project ' : ''}import rule`}
                          disabled={
                            readOnly || !canDeleteRule || adapter.deleting
                          }
                          onClick={async () => {
                            try {
                              clearFeedback();
                              await adapter.delete(rule.id);
                              setSuccess('Deleted import rule.');
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not delete import rule.'
                              );
                            }
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>

                    {projectScoped ? (
                      rule.originScope === 'company' ? (
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
                      )
                    ) : null}

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
                        data={importRuleActionOptions}
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
                        data={importRuleFieldOptions}
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
                        data={importRuleOperatorOptions}
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
                          loading={adapter.updating}
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

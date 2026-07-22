import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import classes from '../styles/ui.module.css';
import type {
  ImportRule,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
} from '../types';
import {
  getProjectStandardBadge,
  isInheritedCompanyStandard,
} from '../utils/projectStandards';
import {
  canMoveImportRule,
  importRuleActionOptions,
  importRuleFieldOptions,
  importRuleOperatorOptions,
  nextImportRuleSortOrder,
  toImportRuleAction,
  toImportRuleField,
  toImportRuleOperator,
} from './importRuleEditorModel';
import {
  ManagementActionsMenu,
  ManagementListCard,
  ManagementModalIntro,
} from './ManagementModalUi';
import { firefoxSafeModalSelectProps } from './modalSelectProps';

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

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function actionColor(action: ImportRuleAction) {
  if (action === 'review') return 'yellow';
  if (action === 'import') return 'blue';
  return 'gray';
}

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

  const [newName, setNewName] = useState('');
  const [newAction, setNewAction] = useState<ImportRuleAction>('exclude');
  const [newField, setNewField] = useState<ImportRuleField>('source');
  const [newOperator, setNewOperator] = useState<ImportRuleOperator>('equals');
  const [newValue, setNewValue] = useState('');
  const [editingRule, setEditingRule] = useState<ImportRule | null>(null);
  const [editName, setEditName] = useState('');
  const [editAction, setEditAction] = useState<ImportRuleAction>('exclude');
  const [editField, setEditField] = useState<ImportRuleField>('source');
  const [editOperator, setEditOperator] =
    useState<ImportRuleOperator>('equals');
  const [editValue, setEditValue] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ImportRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  function beginEdit(rule: ImportRule) {
    clearFeedback();
    setEditingRule(rule);
    setEditName(rule.name);
    setEditAction(rule.action);
    setEditField(rule.field);
    setEditOperator(rule.operator);
    setEditValue(rule.value);
    setEditEnabled(rule.enabled);
  }

  function closeEdit() {
    setEditingRule(null);
    setError(null);
  }

  async function moveRule(ruleId: ImportRule['id'], direction: -1 | 1) {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
    const currentRule = rules[currentIndex];
    const targetRule = rules[currentIndex + direction];
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

  function closeManager() {
    clearFeedback();
    setEditingRule(null);
    setPendingDelete(null);
    onClose();
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeManager}
        title={
          projectScoped
            ? 'Manage project import rules'
            : 'Manage company import rules'
        }
        fullScreen={isMobile}
        centered={!isMobile}
        size="lg"
        lockScroll={false}
        styles={{
          body: {
            maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md" className={classes.modalStack}>
          {error ? <Alert color="red">{error}</Alert> : null}
          {success ? (
            <Alert
              color="green"
              withCloseButton
              onClose={() => setSuccess(null)}
            >
              {success}
            </Alert>
          ) : null}
          {readOnly ? (
            <Alert color="blue">
              You can view import rules, but you do not have permission to
              change them.
            </Alert>
          ) : null}

          <ManagementModalIntro title="Import rule priority">
            {projectScoped
              ? 'Project rules run before company rules, allowing project-specific import handling. The first enabled match wins.'
              : 'Company rules decide whether matching rows import, are excluded, or require a preview decision before auto-coding runs. The first enabled match wins.'}{' '}
            For “any of” matches, separate values with commas or new lines.
          </ManagementModalIntro>

          {!readOnly ? (
            <Paper
              withBorder
              radius="md"
              p="md"
              className={classes.taxonomyCreateCard}
            >
              <Stack gap="sm">
                <Stack gap={2}>
                  <Text fw={600}>
                    Add {projectScoped ? 'project' : 'company'} import rule
                  </Text>
                  <Text size="sm" c="dimmed">
                    Name the rule, choose its outcome, and define the matching
                    condition.
                  </Text>
                </Stack>
                <TextInput
                  label="Rule name"
                  placeholder={
                    projectScoped
                      ? 'e.g. Exclude shared service recharge rows'
                      : 'e.g. Exclude SAL payroll source'
                  }
                  value={newName}
                  onChange={(event) => {
                    clearFeedback();
                    setNewName(event.currentTarget.value);
                  }}
                />
                <Group grow align="flex-end" wrap="wrap">
                  <Select
                    label="Action"
                    data={importRuleActionOptions}
                    value={newAction}
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
                    searchable
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
                  onChange={(event) => {
                    clearFeedback();
                    setNewValue(event.currentTarget.value);
                  }}
                />
                <Group className={classes.footerRow}>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    loading={adapter.creating}
                    disabled={!newName.trim() || !newValue.trim()}
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
          ) : null}

          {adapter.loading && rules.length === 0 ? (
            <Text className={classes.emptyState}>Loading import rules…</Text>
          ) : rules.length === 0 ? (
            <Text className={classes.emptyState}>No import rules yet.</Text>
          ) : (
            <Stack gap="xs">
              {rules.map((rule, index) => {
                const sourceBadge = projectScoped
                  ? getProjectStandardBadge(rule)
                  : null;
                const inherited = isInheritedCompanyStandard(rule);
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
                return (
                  <ManagementListCard
                    key={rule.id}
                    title={rule.name}
                    badges={
                      <>
                        <Badge variant="light">Rule {index + 1}</Badge>
                        <Badge
                          variant="light"
                          color={rule.enabled ? 'green' : 'gray'}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Badge variant="light" color={actionColor(rule.action)}>
                          {optionLabel(importRuleActionOptions, rule.action)}
                        </Badge>
                        {sourceBadge ? (
                          <Badge variant="light" color={sourceBadge.color}>
                            {sourceBadge.label}
                          </Badge>
                        ) : null}
                      </>
                    }
                    metadata={
                      <Text size="sm" c="dimmed">
                        {optionLabel(importRuleFieldOptions, rule.field)} ·{' '}
                        {optionLabel(importRuleOperatorOptions, rule.operator)}{' '}
                        · “{rule.value}”
                      </Text>
                    }
                    actions={
                      !readOnly ? (
                        <ManagementActionsMenu
                          label={`Actions for import rule ${rule.name}`}
                        >
                          <Menu.Item onClick={() => beginEdit(rule)}>
                            Edit rule
                          </Menu.Item>
                          <Menu.Item
                            disabled={adapter.updating}
                            onClick={async () => {
                              try {
                                clearFeedback();
                                await adapter.update({
                                  id: rule.id,
                                  enabled: !rule.enabled,
                                });
                                setSuccess(
                                  rule.enabled
                                    ? 'Disabled import rule.'
                                    : 'Enabled import rule.'
                                );
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Could not update import rule.'
                                );
                              }
                            }}
                          >
                            {rule.enabled ? 'Disable rule' : 'Enable rule'}
                          </Menu.Item>
                          <Menu.Item
                            disabled={!canMoveUp || adapter.updating}
                            onClick={() => void moveRule(rule.id, -1)}
                          >
                            Move up
                          </Menu.Item>
                          <Menu.Item
                            disabled={!canMoveDown || adapter.updating}
                            onClick={() => void moveRule(rule.id, 1)}
                          >
                            Move down
                          </Menu.Item>
                          {projectScoped &&
                          adapter.canPromote &&
                          adapter.promote &&
                          !inherited ? (
                            <Menu.Item
                              disabled={adapter.promoting}
                              onClick={async () => {
                                try {
                                  clearFeedback();
                                  const promoted = await adapter.promote?.(
                                    rule.id
                                  );
                                  setSuccess(
                                    `Added "${rule.name}" to company import rules as "${promoted?.name ?? rule.name}".`
                                  );
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Could not add rule to company import rules.'
                                  );
                                }
                              }}
                            >
                              Add to company import rules
                            </Menu.Item>
                          ) : null}
                          {!inherited ? (
                            <>
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={15} />}
                                onClick={() => {
                                  clearFeedback();
                                  setPendingDelete(rule);
                                }}
                              >
                                Delete rule
                              </Menu.Item>
                            </>
                          ) : null}
                        </ManagementActionsMenu>
                      ) : null
                    }
                  />
                );
              })}
              <Text size="xs" c="dimmed">
                Priority runs from top to bottom. Disabled rules are skipped.
              </Text>
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={!!editingRule}
        onClose={closeEdit}
        title="Edit import rule"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          {projectScoped && editingRule?.originScope === 'company' ? (
            <Text size="sm" c="dimmed" className={classes.modalIntro}>
              Editing this inherited rule creates a project-specific override.
            </Text>
          ) : null}
          <TextInput
            label="Rule name"
            value={editName}
            onChange={(event) => {
              setError(null);
              setEditName(event.currentTarget.value);
            }}
          />
          <Group grow align="flex-end" wrap="wrap">
            <Select
              label="Action"
              data={importRuleActionOptions}
              value={editAction}
              {...firefoxSafeModalSelectProps}
              onChange={(value) => {
                const next = toImportRuleAction(value);
                if (next) setEditAction(next);
              }}
            />
            <Select
              label="Field"
              data={importRuleFieldOptions}
              value={editField}
              searchable
              {...firefoxSafeModalSelectProps}
              onChange={(value) => {
                const next = toImportRuleField(value);
                if (next) setEditField(next);
              }}
            />
            <Select
              label="Match"
              data={importRuleOperatorOptions}
              value={editOperator}
              {...firefoxSafeModalSelectProps}
              onChange={(value) => {
                const next = toImportRuleOperator(value);
                if (next) setEditOperator(next);
              }}
            />
          </Group>
          <TextInput
            label="Value"
            value={editValue}
            onChange={(event) => {
              setError(null);
              setEditValue(event.currentTarget.value);
            }}
          />
          <Switch
            label="Rule enabled"
            checked={editEnabled}
            onChange={(event) => setEditEnabled(event.currentTarget.checked)}
          />
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={adapter.updating}
              onClick={closeEdit}
            >
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              loading={adapter.updating}
              disabled={!editingRule || !editName.trim() || !editValue.trim()}
              onClick={async () => {
                if (!editingRule) return;
                try {
                  clearFeedback();
                  await adapter.update({
                    id: editingRule.id,
                    name: editName.trim(),
                    action: editAction,
                    field: editField,
                    operator: editOperator,
                    value: editValue.trim(),
                    enabled: editEnabled,
                    sortOrder: editingRule.sortOrder,
                  });
                  closeEdit();
                  setSuccess('Updated import rule.');
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Could not update import rule.'
                  );
                }
              }}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete import rule?"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Delete “{pendingDelete?.name ?? ''}”? Previous import decisions and
            existing transactions are not changed.
          </Text>
          <Group className={classes.footerRow}>
            <Button
              variant="default"
              fullWidth={isMobile}
              disabled={adapter.deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              loading={adapter.deleting}
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  clearFeedback();
                  await adapter.delete(pendingDelete.id);
                  setPendingDelete(null);
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
              Delete rule
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

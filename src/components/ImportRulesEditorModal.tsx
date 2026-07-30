import { useReducer } from 'react';
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

type ImportRuleFormState = {
  name: string;
  action: ImportRuleAction;
  field: ImportRuleField;
  operator: ImportRuleOperator;
  value: string;
  enabled: boolean;
};

type ImportRulesEditorState = {
  newRule: ImportRuleFormState;
  editingRule: ImportRule | null;
  editRule: ImportRuleFormState;
  pendingDelete: ImportRule | null;
  error: string | null;
  success: string | null;
};

type ImportRulesEditorAction =
  | { type: 'clearFeedback' }
  | { type: 'success'; message: string | null }
  | { type: 'error'; message: string | null }
  | { type: 'updateNewRule'; patch: Partial<ImportRuleFormState> }
  | { type: 'newRuleCreated' }
  | { type: 'beginEdit'; rule: ImportRule }
  | { type: 'updateEditRule'; patch: Partial<ImportRuleFormState> }
  | { type: 'closeEdit' }
  | { type: 'requestDelete'; rule: ImportRule | null }
  | { type: 'closeManager' };

const emptyImportRuleForm: ImportRuleFormState = {
  name: '',
  action: 'exclude',
  field: 'source',
  operator: 'equals',
  value: '',
  enabled: true,
};

const initialImportRulesEditorState: ImportRulesEditorState = {
  newRule: emptyImportRuleForm,
  editingRule: null,
  editRule: emptyImportRuleForm,
  pendingDelete: null,
  error: null,
  success: null,
};

function importRulesEditorReducer(
  state: ImportRulesEditorState,
  action: ImportRulesEditorAction
): ImportRulesEditorState {
  if (action.type === 'clearFeedback') {
    return { ...state, error: null, success: null };
  }
  if (action.type === 'success') {
    return { ...state, error: null, success: action.message };
  }
  if (action.type === 'error') {
    return { ...state, error: action.message };
  }
  if (action.type === 'updateNewRule') {
    return {
      ...state,
      newRule: { ...state.newRule, ...action.patch },
      error: null,
      success: null,
    };
  }
  if (action.type === 'newRuleCreated') {
    return {
      ...state,
      newRule: emptyImportRuleForm,
      error: null,
      success: 'Added import rule.',
    };
  }
  if (action.type === 'beginEdit') {
    return {
      ...state,
      editingRule: action.rule,
      editRule: {
        name: action.rule.name,
        action: action.rule.action,
        field: action.rule.field,
        operator: action.rule.operator,
        value: action.rule.value,
        enabled: action.rule.enabled,
      },
      error: null,
      success: null,
    };
  }
  if (action.type === 'updateEditRule') {
    return {
      ...state,
      editRule: { ...state.editRule, ...action.patch },
      error: null,
    };
  }
  if (action.type === 'closeEdit') {
    return { ...state, editingRule: null, error: null };
  }
  if (action.type === 'requestDelete') {
    return {
      ...state,
      pendingDelete: action.rule,
      error: null,
      success: action.rule ? null : state.success,
    };
  }
  return {
    ...state,
    editingRule: null,
    pendingDelete: null,
    error: null,
    success: null,
  };
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

  const [editorState, dispatchEditor] = useReducer(
    importRulesEditorReducer,
    initialImportRulesEditorState
  );
  const {
    newRule: {
      name: newName,
      action: newAction,
      field: newField,
      operator: newOperator,
      value: newValue,
    },
    editingRule,
    editRule: {
      name: editName,
      action: editAction,
      field: editField,
      operator: editOperator,
      value: editValue,
      enabled: editEnabled,
    },
    pendingDelete,
    error,
    success,
  } = editorState;

  function clearFeedback() {
    dispatchEditor({ type: 'clearFeedback' });
  }

  function beginEdit(rule: ImportRule) {
    dispatchEditor({ type: 'beginEdit', rule });
  }

  function closeEdit() {
    dispatchEditor({ type: 'closeEdit' });
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
      dispatchEditor({
        type: 'success',
        message:
          direction < 0 ? 'Moved import rule up.' : 'Moved import rule down.',
      });
    } catch (err) {
      dispatchEditor({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Could not reorder import rule.',
      });
    }
  }

  function closeManager() {
    dispatchEditor({ type: 'closeManager' });
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
              onClose={() => dispatchEditor({ type: 'success', message: null })}
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
                  onChange={(event) =>
                    dispatchEditor({
                      type: 'updateNewRule',
                      patch: { name: event.currentTarget.value },
                    })
                  }
                />
                <Group grow align="flex-end" wrap="wrap">
                  <Select
                    label="Action"
                    data={importRuleActionOptions}
                    value={newAction}
                    {...firefoxSafeModalSelectProps}
                    onChange={(value) => {
                      const next = toImportRuleAction(value);
                      if (next) {
                        dispatchEditor({
                          type: 'updateNewRule',
                          patch: { action: next },
                        });
                      }
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
                      if (next) {
                        dispatchEditor({
                          type: 'updateNewRule',
                          patch: { field: next },
                        });
                      }
                    }}
                  />
                  <Select
                    label="Match"
                    data={importRuleOperatorOptions}
                    value={newOperator}
                    {...firefoxSafeModalSelectProps}
                    onChange={(value) => {
                      const next = toImportRuleOperator(value);
                      if (next) {
                        dispatchEditor({
                          type: 'updateNewRule',
                          patch: { operator: next },
                        });
                      }
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
                  onChange={(event) =>
                    dispatchEditor({
                      type: 'updateNewRule',
                      patch: { value: event.currentTarget.value },
                    })
                  }
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
                        dispatchEditor({ type: 'newRuleCreated' });
                      } catch (err) {
                        dispatchEditor({
                          type: 'error',
                          message:
                            err instanceof Error
                              ? err.message
                              : 'Could not add import rule.',
                        });
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
                                dispatchEditor({
                                  type: 'success',
                                  message: rule.enabled
                                    ? 'Disabled import rule.'
                                    : 'Enabled import rule.',
                                });
                              } catch (err) {
                                dispatchEditor({
                                  type: 'error',
                                  message:
                                    err instanceof Error
                                      ? err.message
                                      : 'Could not update import rule.',
                                });
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
                                  dispatchEditor({
                                    type: 'success',
                                    message: `Added "${rule.name}" to company import rules as "${promoted?.name ?? rule.name}".`,
                                  });
                                } catch (err) {
                                  dispatchEditor({
                                    type: 'error',
                                    message:
                                      err instanceof Error
                                        ? err.message
                                        : 'Could not add rule to company import rules.',
                                  });
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
                                  dispatchEditor({
                                    type: 'requestDelete',
                                    rule,
                                  });
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
            onChange={(event) =>
              dispatchEditor({
                type: 'updateEditRule',
                patch: { name: event.currentTarget.value },
              })
            }
          />
          <Group grow align="flex-end" wrap="wrap">
            <Select
              label="Action"
              data={importRuleActionOptions}
              value={editAction}
              {...firefoxSafeModalSelectProps}
              onChange={(value) => {
                const next = toImportRuleAction(value);
                if (next) {
                  dispatchEditor({
                    type: 'updateEditRule',
                    patch: { action: next },
                  });
                }
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
                if (next) {
                  dispatchEditor({
                    type: 'updateEditRule',
                    patch: { field: next },
                  });
                }
              }}
            />
            <Select
              label="Match"
              data={importRuleOperatorOptions}
              value={editOperator}
              {...firefoxSafeModalSelectProps}
              onChange={(value) => {
                const next = toImportRuleOperator(value);
                if (next) {
                  dispatchEditor({
                    type: 'updateEditRule',
                    patch: { operator: next },
                  });
                }
              }}
            />
          </Group>
          <TextInput
            label="Value"
            value={editValue}
            onChange={(event) =>
              dispatchEditor({
                type: 'updateEditRule',
                patch: { value: event.currentTarget.value },
              })
            }
          />
          <Switch
            label="Rule enabled"
            checked={editEnabled}
            onChange={(event) =>
              dispatchEditor({
                type: 'updateEditRule',
                patch: { enabled: event.currentTarget.checked },
              })
            }
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
                  dispatchEditor({
                    type: 'success',
                    message: 'Updated import rule.',
                  });
                } catch (err) {
                  dispatchEditor({
                    type: 'error',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Could not update import rule.',
                  });
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
        onClose={() => dispatchEditor({ type: 'requestDelete', rule: null })}
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
              onClick={() =>
                dispatchEditor({ type: 'requestDelete', rule: null })
              }
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
                  dispatchEditor({ type: 'requestDelete', rule: null });
                  dispatchEditor({
                    type: 'success',
                    message: 'Deleted import rule.',
                  });
                } catch (err) {
                  dispatchEditor({
                    type: 'error',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Could not delete import rule.',
                  });
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

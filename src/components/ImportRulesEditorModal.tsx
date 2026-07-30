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

function useImportRulesEditorModalController(props: {
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

  return {
    adapter,
    beginEdit,
    clearFeedback,
    closeEdit,
    closeManager,
    dispatchEditor,
    editAction,
    editEnabled,
    editField,
    editName,
    editOperator,
    editValue,
    editingRule,
    error,
    isMobile,
    moveRule,
    newAction,
    newField,
    newName,
    newOperator,
    newValue,
    onClose,
    opened,
    pendingDelete,
    projectScoped,
    readOnly,
    rules,
    success,
  };
}

type ImportRulesEditorModalController = ReturnType<
  typeof useImportRulesEditorModalController
>;

function ImportRuleComposer({
  model,
}: {
  model: ImportRulesEditorModalController;
}) {
  return (
    <Paper withBorder radius="md" p="md" className={classes.taxonomyCreateCard}>
      <Stack gap="sm">
        <Stack gap={2}>
          <Text fw={600}>
            Add {model.projectScoped ? 'project' : 'company'} import rule
          </Text>
          <Text size="sm" c="dimmed">
            Name the rule, choose its outcome, and define the matching
            condition.
          </Text>
        </Stack>
        <TextInput
          label="Rule name"
          placeholder={
            model.projectScoped
              ? 'e.g. Exclude shared service recharge rows'
              : 'e.g. Exclude SAL payroll source'
          }
          value={model.newName}
          onChange={(event) =>
            model.dispatchEditor({
              type: 'updateNewRule',
              patch: { name: event.currentTarget.value },
            })
          }
        />
        <Group grow align="flex-end" wrap="wrap">
          <Select
            label="Action"
            data={importRuleActionOptions}
            value={model.newAction}
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleAction(value);
              if (next) {
                model.dispatchEditor({
                  type: 'updateNewRule',
                  patch: { action: next },
                });
              }
            }}
          />
          <Select
            label="Field"
            data={importRuleFieldOptions}
            value={model.newField}
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleField(value);
              if (next) {
                model.dispatchEditor({
                  type: 'updateNewRule',
                  patch: { field: next },
                });
              }
            }}
          />
          <Select
            label="Match"
            data={importRuleOperatorOptions}
            value={model.newOperator}
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleOperator(value);
              if (next) {
                model.dispatchEditor({
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
            model.projectScoped
              ? 'e.g. payroll, SAL, recharge'
              : 'e.g. SAL, EXA, payroll'
          }
          value={model.newValue}
          onChange={(event) =>
            model.dispatchEditor({
              type: 'updateNewRule',
              patch: { value: event.currentTarget.value },
            })
          }
        />
        <Group className={classes.footerRow}>
          <Button
            leftSection={<IconPlus size={16} />}
            loading={model.adapter.creating}
            disabled={!model.newName.trim() || !model.newValue.trim()}
            onClick={async () => {
              try {
                model.clearFeedback();
                await model.adapter.create({
                  name: model.newName.trim(),
                  action: model.newAction,
                  field: model.newField,
                  operator: model.newOperator,
                  value: model.newValue.trim(),
                  sortOrder: nextImportRuleSortOrder(model.rules),
                  enabled: true,
                });
                model.dispatchEditor({ type: 'newRuleCreated' });
              } catch (err) {
                model.dispatchEditor({
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
  );
}

function ImportRulesList({
  model,
}: {
  model: ImportRulesEditorModalController;
}) {
  return (
    <Stack gap="xs">
      {model.rules.map((rule, index) => {
        const sourceBadge = model.projectScoped
          ? getProjectStandardBadge(rule)
          : null;
        const inherited = isInheritedCompanyStandard(rule);
        const canMoveUp = canMoveImportRule({
          rules: model.rules,
          index,
          direction: -1,
          scope: model.adapter.scope,
        });
        const canMoveDown = canMoveImportRule({
          rules: model.rules,
          index,
          direction: 1,
          scope: model.adapter.scope,
        });
        return (
          <ManagementListCard
            key={rule.id}
            title={rule.name}
            badges={
              <>
                <Badge variant="light">Rule {index + 1}</Badge>
                <Badge variant="light" color={rule.enabled ? 'green' : 'gray'}>
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
                {optionLabel(importRuleOperatorOptions, rule.operator)} · “
                {rule.value}”
              </Text>
            }
            actions={
              !model.readOnly ? (
                <ManagementActionsMenu
                  label={`Actions for import rule ${rule.name}`}
                >
                  <Menu.Item onClick={() => model.beginEdit(rule)}>
                    Edit rule
                  </Menu.Item>
                  <Menu.Item
                    disabled={model.adapter.updating}
                    onClick={async () => {
                      try {
                        model.clearFeedback();
                        await model.adapter.update({
                          id: rule.id,
                          enabled: !rule.enabled,
                        });
                        model.dispatchEditor({
                          type: 'success',
                          message: rule.enabled
                            ? 'Disabled import rule.'
                            : 'Enabled import rule.',
                        });
                      } catch (err) {
                        model.dispatchEditor({
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
                    disabled={!canMoveUp || model.adapter.updating}
                    onClick={() => void model.moveRule(rule.id, -1)}
                  >
                    Move up
                  </Menu.Item>
                  <Menu.Item
                    disabled={!canMoveDown || model.adapter.updating}
                    onClick={() => void model.moveRule(rule.id, 1)}
                  >
                    Move down
                  </Menu.Item>
                  {model.projectScoped &&
                  model.adapter.canPromote &&
                  model.adapter.promote &&
                  !inherited ? (
                    <Menu.Item
                      disabled={model.adapter.promoting}
                      onClick={async () => {
                        try {
                          model.clearFeedback();
                          const promoted = await model.adapter.promote?.(
                            rule.id
                          );
                          model.dispatchEditor({
                            type: 'success',
                            message: `Added "${rule.name}" to company import rules as "${promoted?.name ?? rule.name}".`,
                          });
                        } catch (err) {
                          model.dispatchEditor({
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
                          model.clearFeedback();
                          model.dispatchEditor({
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
  );
}

function EditImportRuleModal({
  model,
}: {
  model: ImportRulesEditorModalController;
}) {
  return (
    <Modal
      opened={!!model.editingRule}
      onClose={model.closeEdit}
      title="Edit import rule"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
      lockScroll={false}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        {model.projectScoped && model.editingRule?.originScope === 'company' ? (
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Editing this inherited rule creates a project-specific override.
          </Text>
        ) : null}
        <TextInput
          label="Rule name"
          value={model.editName}
          onChange={(event) =>
            model.dispatchEditor({
              type: 'updateEditRule',
              patch: { name: event.currentTarget.value },
            })
          }
        />
        <Group grow align="flex-end" wrap="wrap">
          <Select
            label="Action"
            data={importRuleActionOptions}
            value={model.editAction}
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleAction(value);
              if (next) {
                model.dispatchEditor({
                  type: 'updateEditRule',
                  patch: { action: next },
                });
              }
            }}
          />
          <Select
            label="Field"
            data={importRuleFieldOptions}
            value={model.editField}
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleField(value);
              if (next) {
                model.dispatchEditor({
                  type: 'updateEditRule',
                  patch: { field: next },
                });
              }
            }}
          />
          <Select
            label="Match"
            data={importRuleOperatorOptions}
            value={model.editOperator}
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              const next = toImportRuleOperator(value);
              if (next) {
                model.dispatchEditor({
                  type: 'updateEditRule',
                  patch: { operator: next },
                });
              }
            }}
          />
        </Group>
        <TextInput
          label="Value"
          value={model.editValue}
          onChange={(event) =>
            model.dispatchEditor({
              type: 'updateEditRule',
              patch: { value: event.currentTarget.value },
            })
          }
        />
        <Switch
          label="Rule enabled"
          checked={model.editEnabled}
          onChange={(event) =>
            model.dispatchEditor({
              type: 'updateEditRule',
              patch: { enabled: event.currentTarget.checked },
            })
          }
        />
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.adapter.updating}
            onClick={model.closeEdit}
          >
            Cancel
          </Button>
          <Button
            fullWidth={model.isMobile}
            loading={model.adapter.updating}
            disabled={
              !model.editingRule ||
              !model.editName.trim() ||
              !model.editValue.trim()
            }
            onClick={async () => {
              if (!model.editingRule) return;
              try {
                model.clearFeedback();
                await model.adapter.update({
                  id: model.editingRule.id,
                  name: model.editName.trim(),
                  action: model.editAction,
                  field: model.editField,
                  operator: model.editOperator,
                  value: model.editValue.trim(),
                  enabled: model.editEnabled,
                  sortOrder: model.editingRule.sortOrder,
                });
                model.closeEdit();
                model.dispatchEditor({
                  type: 'success',
                  message: 'Updated import rule.',
                });
              } catch (err) {
                model.dispatchEditor({
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
  );
}

function DeleteImportRuleModal({
  model,
}: {
  model: ImportRulesEditorModalController;
}) {
  return (
    <Modal
      opened={!!model.pendingDelete}
      onClose={() =>
        model.dispatchEditor({ type: 'requestDelete', rule: null })
      }
      title="Delete import rule?"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
      lockScroll={false}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          Delete “{model.pendingDelete?.name ?? ''}”? Previous import decisions
          and existing transactions are not changed.
        </Text>
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.adapter.deleting}
            onClick={() =>
              model.dispatchEditor({ type: 'requestDelete', rule: null })
            }
          >
            Cancel
          </Button>
          <Button
            color="red"
            fullWidth={model.isMobile}
            loading={model.adapter.deleting}
            onClick={async () => {
              if (!model.pendingDelete) return;
              try {
                model.clearFeedback();
                await model.adapter.delete(model.pendingDelete.id);
                model.dispatchEditor({ type: 'requestDelete', rule: null });
                model.dispatchEditor({
                  type: 'success',
                  message: 'Deleted import rule.',
                });
              } catch (err) {
                model.dispatchEditor({
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
  );
}

function ImportRulesEditorModalView({
  model,
}: {
  model: ImportRulesEditorModalController;
}) {
  return (
    <>
      <Modal
        opened={model.opened}
        onClose={model.closeManager}
        title={
          model.projectScoped
            ? 'Manage project import rules'
            : 'Manage company import rules'
        }
        fullScreen={model.isMobile}
        centered={!model.isMobile}
        size="lg"
        lockScroll={false}
        styles={{
          body: {
            maxHeight: model.isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
            overflowY: 'auto',
          },
        }}
      >
        <Stack gap="md" className={classes.modalStack}>
          {model.error ? <Alert color="red">{model.error}</Alert> : null}
          {model.success ? (
            <Alert
              color="green"
              withCloseButton
              onClose={() =>
                model.dispatchEditor({ type: 'success', message: null })
              }
            >
              {model.success}
            </Alert>
          ) : null}
          {model.readOnly ? (
            <Alert color="blue">
              You can view import rules, but you do not have permission to
              change them.
            </Alert>
          ) : null}

          <ManagementModalIntro title="Import rule priority">
            {model.projectScoped
              ? 'Project rules run before company rules, allowing project-specific import handling. The first enabled match wins.'
              : 'Company rules decide whether matching rows import, are excluded, or require a preview decision before auto-coding runs. The first enabled match wins.'}{' '}
            For “any of” matches, separate values with commas or new lines.
          </ManagementModalIntro>

          {!model.readOnly ? <ImportRuleComposer model={model} /> : null}

          {model.adapter.loading && model.rules.length === 0 ? (
            <Text className={classes.emptyState}>Loading import rules…</Text>
          ) : model.rules.length === 0 ? (
            <Text className={classes.emptyState}>No import rules yet.</Text>
          ) : (
            <ImportRulesList model={model} />
          )}
        </Stack>
      </Modal>

      <EditImportRuleModal model={model} />

      <DeleteImportRuleModal model={model} />
    </>
  );
}

export default function ImportRulesEditorModal(
  props: Parameters<typeof useImportRulesEditorModalController>[0]
) {
  const model = useImportRulesEditorModalController(props);
  return <ImportRulesEditorModalView model={model} />;
}

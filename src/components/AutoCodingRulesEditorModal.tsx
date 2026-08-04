import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import classes from '../styles/ui.module.css';
import type {
  ProjectStandardOriginScope,
  ProjectStandardSyncStatus,
} from '../types';
import {
  getProjectStandardBadge,
  isInheritedCompanyStandard,
} from '../utils/projectStandards';
import {
  ManagementActionsMenu,
  ManagementListCard,
  ManagementModalIntro,
} from './ManagementModalUi';
import ModalSelect from './ModalSelect';

type AutoCodingRuleView = {
  id: string;
  matchText: string;
  categoryId: string;
  subCategoryId: string;
  sortOrder: number;
  originScope?: ProjectStandardOriginScope;
  syncStatus?: ProjectStandardSyncStatus;
};

type AutoCodingTaxonomyItem = {
  id: string;
  name: string;
};

type AutoCodingSubCategory = AutoCodingTaxonomyItem & {
  categoryId: string;
};

type AutoCodingRuleMutationDraft = Pick<
  AutoCodingRuleView,
  'matchText' | 'subCategoryId'
>;

export type AutoCodingRulesEditorAdapter = {
  scope: 'company' | 'project';
  rules: AutoCodingRuleView[];
  categories: AutoCodingTaxonomyItem[];
  subCategories: AutoCodingSubCategory[];
  loading: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  promoting?: boolean;
  backfilling?: boolean;
  canPromote?: boolean;
  create: (
    draft: AutoCodingRuleMutationDraft & { sortOrder: number }
  ) => Promise<unknown>;
  update: (
    draft: Partial<AutoCodingRuleMutationDraft> & {
      id: string;
      sortOrder?: number;
    }
  ) => Promise<unknown>;
  delete: (ruleId: string) => Promise<unknown>;
  promote?: (ruleId: string) => Promise<string>;
  backfill?: () => Promise<string>;
};

function canMoveRule(
  rules: AutoCodingRuleView[],
  index: number,
  direction: -1 | 1,
  scope: AutoCodingRulesEditorAdapter['scope']
) {
  const rule = rules[index];
  const target = rules[index + direction];
  if (!rule || !target) return false;
  return scope === 'company' || rule.syncStatus === target.syncStatus;
}

function useAutoCodingRulesEditorModalController(props: {
  opened: boolean;
  onClose: () => void;
  adapter: AutoCodingRulesEditorAdapter;
  readOnly?: boolean;
}) {
  const { opened, onClose, adapter, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const projectScoped = adapter.scope === 'project';
  const rules = adapter.rules;
  const backfillRules = adapter.backfill;
  const promoteRule = adapter.promote;
  const hasTaxonomy =
    adapter.categories.length > 0 && adapter.subCategories.length > 0;
  const categoryOptions = useMemo(
    () =>
      adapter.categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [adapter.categories]
  );

  const [newMatchText, setNewMatchText] = useState('');
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [newSubCategoryId, setNewSubCategoryId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<AutoCodingRuleView | null>(
    null
  );
  const [editMatchText, setEditMatchText] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editSubCategoryId, setEditSubCategoryId] = useState<string | null>(
    null
  );
  const [pendingDelete, setPendingDelete] = useState<AutoCodingRuleView | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const newSubCategoryOptions = useMemo(
    () =>
      adapter.subCategories.flatMap((subCategory) =>
        subCategory.categoryId === newCategoryId
          ? [
              {
                value: subCategory.id,
                label: subCategory.name,
              },
            ]
          : []
      ),
    [adapter.subCategories, newCategoryId]
  );
  const editSubCategoryOptions = useMemo(
    () =>
      adapter.subCategories.flatMap((subCategory) =>
        subCategory.categoryId === editCategoryId
          ? [
              {
                value: subCategory.id,
                label: subCategory.name,
              },
            ]
          : []
      ),
    [adapter.subCategories, editCategoryId]
  );
  const categoryNameById = useMemo(
    () => new Map(adapter.categories.map((item) => [item.id, item.name])),
    [adapter.categories]
  );
  const subCategoryNameById = useMemo(
    () => new Map(adapter.subCategories.map((item) => [item.id, item.name])),
    [adapter.subCategories]
  );

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  function beginEdit(rule: AutoCodingRuleView) {
    clearFeedback();
    setEditingRule(rule);
    setEditMatchText(rule.matchText);
    setEditCategoryId(rule.categoryId);
    setEditSubCategoryId(rule.subCategoryId);
  }

  function closeEdit() {
    setEditingRule(null);
    setEditMatchText('');
    setEditCategoryId(null);
    setEditSubCategoryId(null);
    setError(null);
  }

  async function moveRule(ruleId: string, direction: -1 | 1) {
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
      setSuccess(direction < 0 ? 'Moved rule up.' : 'Moved rule down.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reorder auto-coding rule.'
      );
    }
  }

  function closeManager() {
    clearFeedback();
    setEditingRule(null);
    setPendingDelete(null);
    onClose();
  }

  return {
    adapter,
    backfillRules,
    beginEdit,
    categoryNameById,
    categoryOptions,
    clearFeedback,
    closeEdit,
    closeManager,
    editCategoryId,
    editMatchText,
    editSubCategoryId,
    editSubCategoryOptions,
    editingRule,
    error,
    hasTaxonomy,
    isMobile,
    moveRule,
    newCategoryId,
    newMatchText,
    newSubCategoryId,
    newSubCategoryOptions,
    onClose,
    opened,
    pendingDelete,
    projectScoped,
    promoteRule,
    readOnly,
    rules,
    setEditCategoryId,
    setEditMatchText,
    setEditSubCategoryId,
    setError,
    setNewCategoryId,
    setNewMatchText,
    setNewSubCategoryId,
    setPendingDelete,
    setSuccess,
    subCategoryNameById,
    success,
  };
}

type AutoCodingRulesEditorModalController = ReturnType<
  typeof useAutoCodingRulesEditorModalController
>;

function AutoCodingRuleComposer({
  model,
}: {
  model: AutoCodingRulesEditorModalController;
}) {
  return (
    <Paper withBorder radius="md" p="md" className={classes.taxonomyCreateCard}>
      <Stack gap="sm">
        <Stack gap={2}>
          <Text fw={600}>
            Add {model.projectScoped ? 'project' : 'company'} auto-coding rule
          </Text>
          <Text size="sm" c="dimmed">
            Match imported transaction text to a category and subcategory.
          </Text>
        </Stack>
        <TextInput
          label="Match text"
          placeholder="e.g. uber, airport taxi, officeworks, flight"
          value={model.newMatchText}
          disabled={!model.hasTaxonomy}
          onChange={(event) => {
            model.clearFeedback();
            model.setNewMatchText(event.currentTarget.value);
          }}
        />
        <Group grow align="flex-end" wrap="wrap">
          <ModalSelect
            label="Category"
            placeholder="Select category"
            data={model.categoryOptions}
            value={model.newCategoryId}
            searchable
            disabled={!model.hasTaxonomy}
            onChange={(value) => {
              model.clearFeedback();
              model.setNewCategoryId(value);
              model.setNewSubCategoryId(null);
            }}
          />
          <ModalSelect
            label="Subcategory"
            placeholder={
              model.newCategoryId
                ? 'Select subcategory'
                : 'Choose category first'
            }
            data={model.newSubCategoryOptions}
            value={model.newSubCategoryId}
            searchable
            disabled={!model.newCategoryId}
            onChange={(value) => {
              model.clearFeedback();
              model.setNewSubCategoryId(value);
            }}
          />
        </Group>
        <Group className={classes.footerRow}>
          <Button
            leftSection={<IconPlus size={16} />}
            loading={model.adapter.creating}
            disabled={
              !model.hasTaxonomy ||
              !model.newMatchText.trim() ||
              !model.newCategoryId ||
              !model.newSubCategoryId
            }
            onClick={async () => {
              if (!model.newCategoryId || !model.newSubCategoryId) return;
              try {
                model.clearFeedback();
                await model.adapter.create({
                  matchText: model.newMatchText.trim(),
                  subCategoryId: model.newSubCategoryId,
                  sortOrder: model.rules.length,
                });
                model.setNewMatchText('');
                model.setNewCategoryId(null);
                model.setNewSubCategoryId(null);
                model.setSuccess('Added auto-coding rule.');
              } catch (err) {
                model.setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not add auto-coding rule.'
                );
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

function AutoCodingRulesList({
  model,
}: {
  model: AutoCodingRulesEditorModalController;
}) {
  const promoteRule = model.promoteRule;

  return (
    <Stack gap="xs">
      {model.rules.map((rule, index) => {
        const inherited = isInheritedCompanyStandard(rule);
        const sourceBadge = model.projectScoped
          ? getProjectStandardBadge(rule)
          : null;
        const canMoveUp = canMoveRule(
          model.rules,
          index,
          -1,
          model.adapter.scope
        );
        const canMoveDown = canMoveRule(
          model.rules,
          index,
          1,
          model.adapter.scope
        );
        return (
          <ManagementListCard
            key={rule.id}
            title={rule.matchText}
            badges={
              <>
                <Badge variant="light">Rule {index + 1}</Badge>
                {sourceBadge ? (
                  <Badge variant="light" color={sourceBadge.color}>
                    {sourceBadge.label}
                  </Badge>
                ) : null}
              </>
            }
            metadata={
              <Text size="sm" c="dimmed">
                {model.categoryNameById.get(rule.categoryId) ??
                  'Unknown category'}{' '}
                ·{' '}
                {model.subCategoryNameById.get(rule.subCategoryId) ??
                  'Unknown subcategory'}
              </Text>
            }
            actions={
              !model.readOnly ? (
                <ManagementActionsMenu
                  label={`Actions for auto-coding rule ${rule.matchText}`}
                >
                  <Menu.Item onClick={() => model.beginEdit(rule)}>
                    Edit rule
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
                  promoteRule &&
                  !inherited ? (
                    <Menu.Item
                      disabled={Boolean(model.adapter.promoting)}
                      onClick={async () => {
                        try {
                          model.clearFeedback();
                          model.setSuccess(await promoteRule(rule.id));
                        } catch (err) {
                          model.setError(
                            err instanceof Error
                              ? err.message
                              : 'Could not add rule to company defaults.'
                          );
                        }
                      }}
                    >
                      Add to company defaults
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
                          model.setPendingDelete(rule);
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
        Priority runs from top to bottom. Keep broader matches below specific
        rules.
      </Text>
    </Stack>
  );
}

function EditAutoCodingRuleModal({
  model,
}: {
  model: AutoCodingRulesEditorModalController;
}) {
  return (
    <Modal
      opened={!!model.editingRule}
      onClose={model.closeEdit}
      title="Edit auto-coding rule"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        {model.projectScoped && model.editingRule?.originScope === 'company' ? (
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Editing this inherited rule creates a project-specific override.
          </Text>
        ) : null}
        <TextInput
          label="Match text"
          value={model.editMatchText}
          onChange={(event) => {
            model.setError(null);
            model.setEditMatchText(event.currentTarget.value);
          }}
        />
        <ModalSelect
          label="Category"
          data={model.categoryOptions}
          value={model.editCategoryId}
          searchable
          onChange={(value) => {
            model.setError(null);
            model.setEditCategoryId(value);
            model.setEditSubCategoryId(null);
          }}
        />
        <ModalSelect
          label="Subcategory"
          data={model.editSubCategoryOptions}
          value={model.editSubCategoryId}
          searchable
          disabled={!model.editCategoryId}
          onChange={(value) => {
            model.setError(null);
            model.setEditSubCategoryId(value);
          }}
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
              !model.editMatchText.trim() ||
              !model.editCategoryId ||
              !model.editSubCategoryId
            }
            onClick={async () => {
              if (
                !model.editingRule ||
                !model.editCategoryId ||
                !model.editSubCategoryId
              ) {
                return;
              }
              try {
                model.clearFeedback();
                await model.adapter.update({
                  id: model.editingRule.id,
                  matchText: model.editMatchText.trim(),
                  subCategoryId: model.editSubCategoryId,
                });
                model.closeEdit();
                model.setSuccess('Updated auto-coding rule.');
              } catch (err) {
                model.setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not update auto-coding rule.'
                );
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

function DeleteAutoCodingRuleModal({
  model,
}: {
  model: AutoCodingRulesEditorModalController;
}) {
  return (
    <Modal
      opened={!!model.pendingDelete}
      onClose={() => model.setPendingDelete(null)}
      title="Delete auto-coding rule?"
      fullScreen={model.isMobile}
      centered={!model.isMobile}
    >
      <Stack gap="md">
        {model.error ? <Alert color="red">{model.error}</Alert> : null}
        <Text size="sm" c="dimmed" className={classes.modalIntro}>
          Delete the rule matching “{model.pendingDelete?.matchText ?? ''}”?
          Existing transaction coding is not changed.
        </Text>
        <Group className={classes.footerRow}>
          <Button
            variant="default"
            fullWidth={model.isMobile}
            disabled={model.adapter.deleting}
            onClick={() => model.setPendingDelete(null)}
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
                model.setPendingDelete(null);
                model.setSuccess('Deleted auto-coding rule.');
              } catch (err) {
                model.setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not delete auto-coding rule.'
                );
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

function AutoCodingRulesEditorModalView({
  model,
}: {
  model: AutoCodingRulesEditorModalController;
}) {
  const backfillRules = model.backfillRules;

  return (
    <>
      <Modal
        opened={model.opened}
        onClose={model.closeManager}
        title={
          model.projectScoped
            ? 'Manage project auto-coding rules'
            : 'Manage company auto-coding rules'
        }
        fullScreen={model.isMobile}
        centered={!model.isMobile}
        size="lg"
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
              onClose={() => model.setSuccess(null)}
            >
              {model.success}
            </Alert>
          ) : null}
          {model.readOnly ? (
            <Alert color="blue">
              You can view auto-coding rules, but you do not have permission to
              change them.
            </Alert>
          ) : null}

          <ManagementModalIntro
            title={
              model.projectScoped
                ? 'Project rule priority'
                : 'Company rule priority'
            }
            action={
              model.projectScoped && backfillRules && !model.readOnly ? (
                <Button
                  variant="default"
                  size="compact-sm"
                  loading={Boolean(model.adapter.backfilling)}
                  onClick={async () => {
                    try {
                      model.clearFeedback();
                      model.setSuccess(await backfillRules());
                    } catch (err) {
                      model.setError(
                        err instanceof Error
                          ? err.message
                          : 'Could not apply rules to uncoded transactions.'
                      );
                    }
                  }}
                >
                  Apply to uncoded transactions
                </Button>
              ) : undefined
            }
          >
            {model.projectScoped
              ? 'Project rules run before inherited company rules. Rules are checked from top to bottom, so keep specific matches above broader ones.'
              : 'Rules search transaction item and description text from top to bottom. The first matching rule supplies company-standard coding when that taxonomy exists in a project.'}
          </ManagementModalIntro>

          {!model.readOnly && !model.hasTaxonomy ? (
            <Alert color="blue" className={classes.notice}>
              Add categories and subcategories first. Auto-coding rules need a
              coding target.
            </Alert>
          ) : null}

          {!model.readOnly ? <AutoCodingRuleComposer model={model} /> : null}

          {model.adapter.loading && model.rules.length === 0 ? (
            <Text className={classes.emptyState}>
              Loading auto-coding rules…
            </Text>
          ) : model.rules.length === 0 ? (
            <Text className={classes.emptyState}>
              No auto-coding rules yet.
            </Text>
          ) : (
            <AutoCodingRulesList model={model} />
          )}
        </Stack>
      </Modal>

      <EditAutoCodingRuleModal model={model} />

      <DeleteAutoCodingRuleModal model={model} />
    </>
  );
}

export default function AutoCodingRulesEditorModal(
  props: Parameters<typeof useAutoCodingRulesEditorModalController>[0]
) {
  const model = useAutoCodingRulesEditorModalController(props);
  return <AutoCodingRulesEditorModalView model={model} />;
}

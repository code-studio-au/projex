import { useMemo, useState } from 'react';
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
import { firefoxSafeModalSelectProps } from './modalSelectProps';

export type AutoCodingRuleView = {
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

export default function AutoCodingRulesEditorModal(props: {
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
      adapter.subCategories
        .filter((subCategory) => subCategory.categoryId === newCategoryId)
        .map((subCategory) => ({
          value: subCategory.id,
          label: subCategory.name,
        })),
    [adapter.subCategories, newCategoryId]
  );
  const editSubCategoryOptions = useMemo(
    () =>
      adapter.subCategories
        .filter((subCategory) => subCategory.categoryId === editCategoryId)
        .map((subCategory) => ({
          value: subCategory.id,
          label: subCategory.name,
        })),
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

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeManager}
        title={
          projectScoped
            ? 'Manage project auto-coding rules'
            : 'Manage company auto-coding rules'
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
              You can view auto-coding rules, but you do not have permission to
              change them.
            </Alert>
          ) : null}

          <ManagementModalIntro
            title={
              projectScoped ? 'Project rule priority' : 'Company rule priority'
            }
            action={
              projectScoped && backfillRules && !readOnly ? (
                <Button
                  variant="default"
                  size="compact-sm"
                  loading={adapter.backfilling}
                  onClick={async () => {
                    try {
                      clearFeedback();
                      setSuccess(await backfillRules());
                    } catch (err) {
                      setError(
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
            {projectScoped
              ? 'Project rules run before inherited company rules. Rules are checked from top to bottom, so keep specific matches above broader ones.'
              : 'Rules search transaction item and description text from top to bottom. The first matching rule supplies company-standard coding when that taxonomy exists in a project.'}
          </ManagementModalIntro>

          {!readOnly && !hasTaxonomy ? (
            <Alert color="blue" className={classes.notice}>
              Add categories and subcategories first. Auto-coding rules need a
              coding target.
            </Alert>
          ) : null}

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
                    Add {projectScoped ? 'project' : 'company'} auto-coding rule
                  </Text>
                  <Text size="sm" c="dimmed">
                    Match imported transaction text to a category and
                    subcategory.
                  </Text>
                </Stack>
                <TextInput
                  label="Match text"
                  placeholder="e.g. uber, airport taxi, officeworks, flight"
                  value={newMatchText}
                  disabled={!hasTaxonomy}
                  onChange={(event) => {
                    clearFeedback();
                    setNewMatchText(event.currentTarget.value);
                  }}
                />
                <Group grow align="flex-end" wrap="wrap">
                  <Select
                    label="Category"
                    placeholder="Select category"
                    data={categoryOptions}
                    value={newCategoryId}
                    searchable
                    disabled={!hasTaxonomy}
                    {...firefoxSafeModalSelectProps}
                    onChange={(value) => {
                      clearFeedback();
                      setNewCategoryId(value);
                      setNewSubCategoryId(null);
                    }}
                  />
                  <Select
                    label="Subcategory"
                    placeholder={
                      newCategoryId
                        ? 'Select subcategory'
                        : 'Choose category first'
                    }
                    data={newSubCategoryOptions}
                    value={newSubCategoryId}
                    searchable
                    disabled={!newCategoryId}
                    {...firefoxSafeModalSelectProps}
                    onChange={(value) => {
                      clearFeedback();
                      setNewSubCategoryId(value);
                    }}
                  />
                </Group>
                <Group className={classes.footerRow}>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    loading={adapter.creating}
                    disabled={
                      !hasTaxonomy ||
                      !newMatchText.trim() ||
                      !newCategoryId ||
                      !newSubCategoryId
                    }
                    onClick={async () => {
                      if (!newCategoryId || !newSubCategoryId) return;
                      try {
                        clearFeedback();
                        await adapter.create({
                          matchText: newMatchText.trim(),
                          subCategoryId: newSubCategoryId,
                          sortOrder: rules.length,
                        });
                        setNewMatchText('');
                        setNewCategoryId(null);
                        setNewSubCategoryId(null);
                        setSuccess('Added auto-coding rule.');
                      } catch (err) {
                        setError(
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
          ) : null}

          {adapter.loading && rules.length === 0 ? (
            <Text className={classes.emptyState}>
              Loading auto-coding rules…
            </Text>
          ) : rules.length === 0 ? (
            <Text className={classes.emptyState}>
              No auto-coding rules yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {rules.map((rule, index) => {
                const inherited = isInheritedCompanyStandard(rule);
                const sourceBadge = projectScoped
                  ? getProjectStandardBadge(rule)
                  : null;
                const canMoveUp = canMoveRule(rules, index, -1, adapter.scope);
                const canMoveDown = canMoveRule(rules, index, 1, adapter.scope);
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
                        {categoryNameById.get(rule.categoryId) ??
                          'Unknown category'}{' '}
                        ·{' '}
                        {subCategoryNameById.get(rule.subCategoryId) ??
                          'Unknown subcategory'}
                      </Text>
                    }
                    actions={
                      !readOnly ? (
                        <ManagementActionsMenu
                          label={`Actions for auto-coding rule ${rule.matchText}`}
                        >
                          <Menu.Item onClick={() => beginEdit(rule)}>
                            Edit rule
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
                          promoteRule &&
                          !inherited ? (
                            <Menu.Item
                              disabled={adapter.promoting}
                              onClick={async () => {
                                try {
                                  clearFeedback();
                                  setSuccess(await promoteRule(rule.id));
                                } catch (err) {
                                  setError(
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
                Priority runs from top to bottom. Keep broader matches below
                specific rules.
              </Text>
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={!!editingRule}
        onClose={closeEdit}
        title="Edit auto-coding rule"
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
            label="Match text"
            value={editMatchText}
            onChange={(event) => {
              setError(null);
              setEditMatchText(event.currentTarget.value);
            }}
          />
          <Select
            label="Category"
            data={categoryOptions}
            value={editCategoryId}
            searchable
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              setError(null);
              setEditCategoryId(value);
              setEditSubCategoryId(null);
            }}
          />
          <Select
            label="Subcategory"
            data={editSubCategoryOptions}
            value={editSubCategoryId}
            searchable
            disabled={!editCategoryId}
            {...firefoxSafeModalSelectProps}
            onChange={(value) => {
              setError(null);
              setEditSubCategoryId(value);
            }}
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
              disabled={
                !editingRule ||
                !editMatchText.trim() ||
                !editCategoryId ||
                !editSubCategoryId
              }
              onClick={async () => {
                if (!editingRule || !editCategoryId || !editSubCategoryId) {
                  return;
                }
                try {
                  clearFeedback();
                  await adapter.update({
                    id: editingRule.id,
                    matchText: editMatchText.trim(),
                    subCategoryId: editSubCategoryId,
                  });
                  closeEdit();
                  setSuccess('Updated auto-coding rule.');
                } catch (err) {
                  setError(
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

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete auto-coding rule?"
        fullScreen={isMobile}
        centered={!isMobile}
        lockScroll={false}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Delete the rule matching “{pendingDelete?.matchText ?? ''}”?
            Existing transaction coding is not changed.
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
                  setSuccess('Deleted auto-coding rule.');
                } catch (err) {
                  setError(
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
    </>
  );
}

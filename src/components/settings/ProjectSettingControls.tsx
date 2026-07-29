import { useId, useMemo } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';

import type { Project, ProjectId } from '../../types';
import {
  AutoSaveSwitch,
  ExplicitSettingActions,
  SettingFeedback,
} from './SettingPersistence';
import { strictEquals, useExplicitSetting } from './useSettingPersistence';

type ProjectStructureValue = {
  projectType: Project['projectType'];
  parentProjectId: ProjectId | null;
};

export type ProgrammeSettingOption = {
  value: ProjectId;
  label: string;
};

function projectStructureEquals(
  left: ProjectStructureValue,
  right: ProjectStructureValue
) {
  return (
    left.projectType === right.projectType &&
    left.parentProjectId === right.parentProjectId
  );
}

function ExplicitSelectSetting<T extends string>(props: {
  label: string;
  description: string;
  value: T;
  data: Array<{ value: T; label: string }>;
  disabled: boolean;
  onSave: (value: T) => Promise<void>;
  isValue: (value: string) => value is T;
  fallbackError: string;
}) {
  const {
    label,
    description,
    value,
    data,
    disabled,
    onSave,
    isValue,
    fallbackError,
  } = props;
  const feedbackId = useId();
  const setting = useExplicitSetting({
    value,
    equals: strictEquals,
    onSave,
    fallbackError,
  });
  const isSaving = setting.phase === 'saving';

  return (
    <Stack gap={4}>
      <Select
        label={label}
        description={description}
        aria-describedby={setting.phase === 'idle' ? undefined : feedbackId}
        value={setting.displayed}
        data={data}
        disabled={disabled || isSaving}
        onChange={(nextValue) => {
          if (nextValue && isValue(nextValue)) {
            setting.setDraft(nextValue);
          }
        }}
      />
      <ExplicitSettingActions
        label={label}
        phase={setting.phase}
        isDirty={setting.isDirty}
        onSave={() => void setting.commit()}
        onCancel={setting.cancel}
      />
      <SettingFeedback
        id={feedbackId}
        label={label}
        phase={setting.phase}
        error={setting.error}
      />
    </Stack>
  );
}

function isProjectCurrency(value: string): value is Project['currency'] {
  return ['AUD', 'USD', 'EUR', 'GBP'].includes(value);
}

function isProjectVisibility(value: string): value is Project['visibility'] {
  return ['private', 'company'].includes(value);
}

function isProjectType(value: string): value is Project['projectType'] {
  return ['project', 'programme'].includes(value);
}

export default function ProjectSettingControls(props: {
  projectType: Project['projectType'];
  parentProjectId: ProjectId | null;
  currency: Project['currency'];
  visibility: Project['visibility'];
  allowSuperadminAccess: boolean;
  syncCompanyDefaults: boolean;
  allowTxnTransfers: boolean;
  programmeOptions: ProgrammeSettingOption[];
  canEditProject: boolean;
  canEditCompanyStructure: boolean;
  canManageTransferCapability: boolean;
  isMobile: boolean;
  onSaveStructure: (value: ProjectStructureValue) => Promise<void>;
  onSaveCurrency: (value: Project['currency']) => Promise<void>;
  onSaveVisibility: (value: Project['visibility']) => Promise<void>;
  onSaveSuperadminAccess: (value: boolean) => Promise<void>;
  onSuperadminAccessSaved?: (value: boolean) => void;
  onSaveSyncCompanyDefaults: (value: boolean) => Promise<void>;
  onSaveAllowTxnTransfers: (value: boolean) => Promise<void>;
}) {
  const {
    projectType,
    parentProjectId,
    currency,
    visibility,
    allowSuperadminAccess,
    syncCompanyDefaults,
    allowTxnTransfers,
    programmeOptions,
    canEditProject,
    canEditCompanyStructure,
    canManageTransferCapability,
    isMobile,
    onSaveStructure,
    onSaveCurrency,
    onSaveVisibility,
    onSaveSuperadminAccess,
    onSuperadminAccessSaved,
    onSaveSyncCompanyDefaults,
    onSaveAllowTxnTransfers,
  } = props;
  const structureFeedbackId = useId();
  const superadminFeedbackId = useId();
  const structureValue = useMemo(
    () => ({ projectType, parentProjectId }),
    [parentProjectId, projectType]
  );
  const structure = useExplicitSetting({
    value: structureValue,
    equals: projectStructureEquals,
    onSave: onSaveStructure,
    fallbackError: 'Unable to save the project structure. Try again.',
  });
  const superadminAccess = useExplicitSetting({
    value: allowSuperadminAccess,
    equals: strictEquals,
    onSave: onSaveSuperadminAccess,
    fallbackError: 'Unable to save superadmin access. Try again.',
  });
  const structureSaving = structure.phase === 'saving';
  const structureDraft = structure.displayed;
  const nextSuperadminAccess = superadminAccess.displayed;
  const superadminToggleLabel = nextSuperadminAccess
    ? 'Enable superadmin access'
    : 'Disable superadmin access';
  const superadminToggleDescription = nextSuperadminAccess
    ? 'Warning: this will allow the global superadmin to view this project, its budget, transactions, and settings for support and troubleshooting. Are you sure you want to enable this access?'
    : 'Superadmin will no longer be able to see this project, its budget, transactions, or settings unless access is re-enabled later. Are you sure you want to disable this access?';

  return (
    <Stack gap="sm" style={{ width: '100%', maxWidth: 460 }}>
      <Stack gap={4}>
        <Select
          label="Type"
          description="Programmes are reporting-only; projects hold budgets, transactions, imports, and coding. Company admins/executives manage this structure."
          aria-describedby={
            structure.phase === 'idle' ? undefined : structureFeedbackId
          }
          value={structureDraft.projectType}
          onChange={(nextValue) => {
            if (!nextValue || !isProjectType(nextValue)) return;
            structure.setDraft({
              projectType: nextValue,
              parentProjectId:
                nextValue === 'programme'
                  ? null
                  : structureDraft.parentProjectId,
            });
          }}
          data={[
            { value: 'project', label: 'Project' },
            { value: 'programme', label: 'Programme (reporting only)' },
          ]}
          disabled={!canEditCompanyStructure || structureSaving}
        />
        <Select
          label="Programme"
          description="Optional reporting programme that this project rolls up into. Company admins/executives manage this structure."
          aria-describedby={
            structure.phase === 'idle' ? undefined : structureFeedbackId
          }
          value={structureDraft.parentProjectId}
          data={programmeOptions}
          clearable
          disabled={
            !canEditCompanyStructure ||
            structureDraft.projectType === 'programme' ||
            structureSaving
          }
          onChange={(nextValue) =>
            structure.setDraft({
              ...structureDraft,
              parentProjectId: nextValue ? (nextValue as ProjectId) : null,
            })
          }
        />
        <ExplicitSettingActions
          label="Project structure"
          phase={structure.phase}
          isDirty={structure.isDirty}
          onSave={() => void structure.commit()}
          onCancel={structure.cancel}
        />
        <SettingFeedback
          id={structureFeedbackId}
          label="Project structure"
          phase={structure.phase}
          error={structure.error}
        />
      </Stack>

      <ExplicitSelectSetting
        label="Currency"
        description="Controls how money is formatted throughout this project workspace."
        value={currency}
        data={[
          { value: 'AUD', label: 'AUD' },
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
          { value: 'GBP', label: 'GBP' },
        ]}
        disabled={!canEditProject}
        onSave={onSaveCurrency}
        isValue={isProjectCurrency}
        fallbackError="Unable to save the project currency. Try again."
      />

      <ExplicitSelectSetting
        label="Visibility"
        description="Controls whether non-members can see this project in the company project list. Opening still requires membership unless you are Admin/Exec/Superadmin."
        value={visibility}
        data={[
          { value: 'private', label: 'Private (members only)' },
          {
            value: 'company',
            label: 'Company-wide (visible to all company users)',
          },
        ]}
        disabled={!canEditProject}
        onSave={onSaveVisibility}
        isValue={isProjectVisibility}
        fallbackError="Unable to save project visibility. Try again."
      />

      <Stack gap={4}>
        <Switch
          label="Allow superadmin access"
          description="Controls whether the global superadmin can open this project for support and troubleshooting. This is on by default for now."
          aria-describedby={
            superadminAccess.phase === 'idle' ? undefined : superadminFeedbackId
          }
          checked={superadminAccess.confirmed}
          onChange={(event) =>
            superadminAccess.setDraft(event.currentTarget.checked)
          }
          disabled={!canEditProject || superadminAccess.phase === 'saving'}
        />
        {superadminAccess.phase === 'saved' ? (
          <SettingFeedback
            id={superadminFeedbackId}
            label="Allow superadmin access"
            phase={superadminAccess.phase}
            error={null}
          />
        ) : null}
      </Stack>

      <AutoSaveSwitch
        label="Sync company standards"
        description="When enabled, this project inherits new company categories, import rules, and auto-coding automatically."
        checked={syncCompanyDefaults}
        disabled={!canEditCompanyStructure || projectType === 'programme'}
        onSave={onSaveSyncCompanyDefaults}
        fallbackError="Unable to save company standards sync."
      />

      <AutoSaveSwitch
        label="Allow transaction transfers out"
        description="Company admins, executives, and management can enable whether this project may move transactions to another project. Programmes cannot transfer transactions."
        checked={allowTxnTransfers}
        disabled={!canManageTransferCapability || projectType === 'programme'}
        onSave={onSaveAllowTxnTransfers}
        fallbackError="Unable to save transaction transfers."
      />

      <Modal
        opened={superadminAccess.draft !== null}
        onClose={superadminAccess.cancel}
        closeOnClickOutside={superadminAccess.phase !== 'saving'}
        closeOnEscape={superadminAccess.phase !== 'saving'}
        withCloseButton={superadminAccess.phase !== 'saving'}
        title={superadminToggleLabel}
        fullScreen={isMobile}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {superadminToggleDescription}
          </Text>
          <SettingFeedback
            id={superadminFeedbackId}
            label="Allow superadmin access"
            phase={superadminAccess.phase}
            error={superadminAccess.error}
          />
          <Group justify="flex-end" wrap="wrap">
            <Button
              variant="default"
              onClick={superadminAccess.cancel}
              disabled={superadminAccess.phase === 'saving'}
              fullWidth={isMobile}
            >
              Cancel
            </Button>
            <Button
              color={nextSuperadminAccess ? 'orange' : 'red'}
              fullWidth={isMobile}
              loading={superadminAccess.phase === 'saving'}
              onClick={async () => {
                const saved = await superadminAccess.commit();
                if (saved) {
                  onSuperadminAccessSaved?.(nextSuperadminAccess);
                }
              }}
            >
              {superadminAccess.phase === 'error'
                ? `Retry ${superadminToggleLabel.toLowerCase()}`
                : superadminToggleLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

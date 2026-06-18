import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type {
  CompanyId,
  Project,
  ProjectId,
  ProjectRole,
  UserId,
} from '../types';
import { asUserId } from '../types';

import {
  useProjectQuery,
  useProjectsQuery,
  useUsersQuery,
} from '../queries/reference';
import { useProjectAutoCodingRulesQuery } from '../queries/projectAutoCodingRules';
import { useProjectImportRulesQuery } from '../queries/importRules';
import { useUpdateProjectMutation } from '../queries/admin';
import {
  useApplyCompanyStandardsMutation,
  useCategoriesQuery,
  useSubCategoriesQuery,
} from '../queries/taxonomy';
import { useBudgets } from '../hooks/useBudgets';
import {
  useCompanyMembershipsQuery,
  useProjectMembershipsQuery,
  useUpsertProjectMembershipMutation,
  useDeleteProjectMembershipMutation,
} from '../queries/memberships';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useTransactions } from '../hooks/useTransactions';
import { summarizeProjectStandardStates } from '../utils/projectStandards';
import { getCompanyUsers } from '../store/access';
import { companyRoute } from '../router';
import { Route as projectWorkspaceRoute } from '../routes/_authed.c.$companyId.p.$projectId';
import ProjectAutoCodingRulesModal from './ProjectAutoCodingRulesModal';
import ProjectImportRulesModal from './ProjectImportRulesModal';
import TaxonomyManagerModal from './TaxonomyManagerModal';
import classes from '../styles/ui.module.css';
import { showAppToast } from '../utils/toast';

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

function toProjectRole(value: string | null): ProjectRole | null {
  if (!value) return null;
  if (
    value === 'owner' ||
    value === 'lead' ||
    value === 'member' ||
    value === 'viewer'
  ) {
    return value;
  }
  return null;
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

export default function ProjectSettingsPanel(props: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = props;
  const loaderData = projectWorkspaceRoute.useLoaderData();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const router = useRouter();

  const project = useProjectQuery(projectId);
  const projects = useProjectsQuery(companyId);
  const usersQ = useUsersQuery();
  const companyMembershipsQ = useCompanyMembershipsQuery(companyId);
  const projectMembershipsQ = useProjectMembershipsQuery(projectId);
  const projectAutoCodingRulesQ = useProjectAutoCodingRulesQuery(projectId);
  const projectImportRulesQ = useProjectImportRulesQuery(projectId);
  const projectCategoriesQ = useCategoriesQuery(projectId);
  const projectSubCategoriesQ = useSubCategoriesQuery(projectId);
  const reapplyCompanyStandards = useApplyCompanyStandardsMutation(
    projectId,
    companyId
  );

  const access = useCompanyAccess(companyId);
  const updateProject = useUpdateProjectMutation(companyId);
  const effectiveProject = useMemo(
    () => ({
      id: projectId,
      projectType:
        (isHydrated ? project.data?.projectType : undefined) ??
        loaderData?.projectType ??
        'project',
      currency:
        (isHydrated ? project.data?.currency : undefined) ??
        loaderData?.currencyCode ??
        'AUD',
      visibility:
        (isHydrated ? project.data?.visibility : undefined) ??
        loaderData?.projectVisibility ??
        'private',
      parentProjectId:
        (isHydrated ? project.data?.parentProjectId : undefined) ??
        loaderData?.parentProjectId ??
        null,
      allowSuperadminAccess:
        (isHydrated ? project.data?.allowSuperadminAccess : undefined) ??
        loaderData?.allowSuperadminAccess ??
        false,
      syncCompanyDefaults:
        (isHydrated ? project.data?.syncCompanyDefaults : undefined) ?? false,
      allowTxnTransfers:
        (isHydrated ? project.data?.allowTxnTransfers : undefined) ??
        loaderData?.allowTxnTransfers ??
        false,
    }),
    [
      isHydrated,
      loaderData?.allowSuperadminAccess,
      loaderData?.allowTxnTransfers,
      loaderData?.currencyCode,
      loaderData?.parentProjectId,
      loaderData?.projectType,
      loaderData?.projectVisibility,
      project.data?.allowSuperadminAccess,
      project.data?.allowTxnTransfers,
      project.data?.currency,
      project.data?.parentProjectId,
      project.data?.projectType,
      project.data?.syncCompanyDefaults,
      project.data?.visibility,
      projectId,
    ]
  );

  const canEditProject = isHydrated
    ? loaderData?.canProjectEdit || access.can('project:edit', projectId)
    : (loaderData?.canProjectEdit ?? false);
  const canEditCompanyStructure = isHydrated
    ? loaderData?.canEditCompanyStructure ||
      access.can('project:configure', projectId)
    : (loaderData?.canEditCompanyStructure ?? false);
  const effectiveIsSuperadmin = isHydrated
    ? access.isSuperadmin
    : (loaderData?.isGlobalSuperadmin ?? false);
  const canManageTransferCapability =
    canEditCompanyStructure &&
    (!effectiveIsSuperadmin || effectiveProject.allowSuperadminAccess);
  const canEditBudgets =
    effectiveProject.projectType === 'project' &&
    (isHydrated ? access.can('budget:edit', projectId) : false);
  const canEditTaxonomy =
    effectiveProject.projectType === 'project' &&
    (isHydrated ? access.can('taxonomy:edit', projectId) : false);
  const settingsBudgets = useBudgets({
    companyId,
    projectId,
    enabled: effectiveProject.projectType === 'project',
  });
  const settingsTxns = useTransactions({
    projectId,
    enabled: effectiveProject.projectType === 'project',
  });
  const settingsTaxonomy = useTaxonomy({
    companyId,
    projectId,
    budgets: settingsBudgets,
    txns: settingsTxns,
    canEditBudgets,
    enabled: effectiveProject.projectType === 'project',
  });
  const programmeOptions = useMemo(
    () =>
      (projects.data ?? [])
        .filter(
          (candidate) =>
            candidate.id !== projectId &&
            candidate.status === 'active' &&
            candidate.projectType === 'programme' &&
            candidate.currency === effectiveProject.currency
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((candidate) => ({ value: candidate.id, label: candidate.name })),
    [effectiveProject.currency, projectId, projects.data]
  );

  const companyUsers = useMemo(
    () =>
      getCompanyUsers(
        companyId,
        usersQ.data ?? [],
        companyMembershipsQ.data ?? []
      ),
    [companyId, usersQ.data, companyMembershipsQ.data]
  );

  const userOptions = useMemo(
    () =>
      companyUsers.map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [companyUsers]
  );

  const [memberUserId, setMemberUserId] = useState<UserId | null>(null);
  const [memberRole, setMemberRole] = useState<ProjectRole | null>('member');
  const [pendingSuperadminAccess, setPendingSuperadminAccess] = useState<
    boolean | null
  >(null);
  const [taxonomyModalOpen, setTaxonomyModalOpen] = useState(false);
  const [projectRulesModalOpen, setProjectRulesModalOpen] = useState(false);
  const [projectImportRulesModalOpen, setProjectImportRulesModalOpen] =
    useState(false);

  const upsert = useUpsertProjectMembershipMutation(projectId);
  const del = useDeleteProjectMembershipMutation(projectId);
  const taxonomyStateSummary = useMemo(
    () =>
      summarizeProjectStandardStates([
        ...(projectCategoriesQ.data ?? []),
        ...(projectSubCategoriesQ.data ?? []),
      ]),
    [projectCategoriesQ.data, projectSubCategoriesQ.data]
  );
  const importRuleStateSummary = useMemo(
    () => summarizeProjectStandardStates(projectImportRulesQ.data ?? []),
    [projectImportRulesQ.data]
  );
  const autoCodingRuleStateSummary = useMemo(
    () => summarizeProjectStandardStates(projectAutoCodingRulesQ.data ?? []),
    [projectAutoCodingRulesQ.data]
  );

  const members = useMemo(
    () => projectMembershipsQ.data ?? [],
    [projectMembershipsQ.data]
  );
  const memberRows = useMemo(
    () =>
      members
        .filter((m) => companyUsers.some((cu) => cu.id === m.userId))
        .map((m, idx) => {
          const user = (usersQ.data ?? []).find((x) => x.id === m.userId);
          return {
            key: `${m.projectId}:${m.userId}:${m.role}:${idx}`,
            userId: m.userId,
            role: m.role,
            name: user?.name ?? String(m.userId),
            email: user?.email ?? '',
          };
        }),
    [members, companyUsers, usersQ.data]
  );

  const memberColumns = useMemo<MRT_ColumnDef<(typeof memberRows)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        Cell: ({ row }) => (
          <Stack gap={2}>
            <Text className="table-body-left-bold">{row.original.name}</Text>
            {row.original.email ? (
              <Text className="table-body-left" c="dimmed">
                {row.original.email}
              </Text>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        Cell: ({ row }) => <Badge variant="light">{row.original.role}</Badge>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        Cell: ({ row }) => (
          <Button
            size="xs"
            color="red"
            variant="light"
            className="tableActionButton"
            disabled={!canEditProject}
            onClick={() =>
              del.mutate({
                userId: row.original.userId,
                role: row.original.role,
              })
            }
          >
            Remove
          </Button>
        ),
      },
    ],
    [canEditProject, del]
  );

  const nextSuperadminAccess =
    pendingSuperadminAccess ?? effectiveProject.allowSuperadminAccess;
  const toggleLabel = nextSuperadminAccess
    ? 'Enable superadmin access'
    : 'Disable superadmin access';
  const toggleDescription = nextSuperadminAccess
    ? 'Warning: this will allow the global superadmin to view this project, its budget, transactions, and settings for support and troubleshooting. Are you sure you want to enable this access?'
    : 'Superadmin will no longer be able to see this project, its budget, transactions, or settings unless access is re-enabled later. Are you sure you want to disable this access?';

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Title order={5}>Project settings</Title>
            <Badge variant="light" color={canEditProject ? 'gray' : 'red'}>
              {canEditProject ? 'Can edit project' : 'Read-only'}
            </Badge>
          </Group>
          <Stack gap="sm" style={{ width: '100%', maxWidth: 460 }}>
            <Select
              label="Type"
              description="Programmes are reporting-only; projects hold budgets, transactions, imports, and coding. Company admins/executives manage this structure."
              value={effectiveProject.projectType}
              onChange={(v) => {
                if (!v || !isProjectType(v)) return;
                updateProject.mutate({
                  id: projectId,
                  projectType: v,
                  parentProjectId: v === 'programme' ? null : undefined,
                });
              }}
              data={[
                { value: 'project', label: 'Project' },
                { value: 'programme', label: 'Programme (reporting only)' },
              ]}
              disabled={!canEditCompanyStructure}
            />
            <Select
              label="Programme"
              description="Optional reporting programme that this project rolls up into. Company admins/executives manage this structure."
              value={effectiveProject.parentProjectId ?? null}
              data={programmeOptions}
              clearable
              disabled={
                !canEditCompanyStructure ||
                effectiveProject.projectType === 'programme'
              }
              onChange={(v) =>
                updateProject.mutate({
                  id: projectId,
                  parentProjectId: v ? (v as ProjectId) : null,
                })
              }
            />
            <Select
              label="Currency"
              description="Controls how money is formatted throughout this project workspace."
              value={effectiveProject.currency}
              onChange={(v) => {
                if (!v || !isProjectCurrency(v)) return;
                updateProject.mutate({
                  id: projectId,
                  currency: v,
                });
              }}
              data={[
                { value: 'AUD', label: 'AUD' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
                { value: 'GBP', label: 'GBP' },
              ]}
              disabled={!canEditProject}
            />
            <Select
              label="Visibility"
              description="Controls whether non-members can see this project in the company project list. Opening still requires membership unless you are Admin/Exec/Superadmin."
              value={effectiveProject.visibility}
              onChange={(v) => {
                if (!v || !isProjectVisibility(v)) return;
                updateProject.mutate({
                  id: projectId,
                  visibility: v,
                });
              }}
              data={[
                { value: 'private', label: 'Private (members only)' },
                {
                  value: 'company',
                  label: 'Company-wide (visible to all company users)',
                },
              ]}
              disabled={!canEditProject}
            />
            <Switch
              label="Allow superadmin access"
              description="Controls whether the global superadmin can open this project for support and troubleshooting. This is on by default for now."
              checked={effectiveProject.allowSuperadminAccess}
              onChange={(event) =>
                setPendingSuperadminAccess(event.currentTarget.checked)
              }
              disabled={!canEditProject || updateProject.isPending}
            />
            <Switch
              label="Sync company standards"
              description="When enabled, this project inherits new company taxonomy defaults and company import rules automatically."
              checked={effectiveProject.syncCompanyDefaults}
              onChange={(event) =>
                updateProject.mutate({
                  id: projectId,
                  syncCompanyDefaults: event.currentTarget.checked,
                })
              }
              disabled={
                !canEditCompanyStructure ||
                effectiveProject.projectType === 'programme' ||
                updateProject.isPending
              }
            />
            <Switch
              label="Allow transaction transfers out"
              description="Company admins, executives, and management can enable whether this project may move transactions to another project. Programmes cannot transfer transactions."
              checked={effectiveProject.allowTxnTransfers}
              onChange={(event) =>
                updateProject.mutate({
                  id: projectId,
                  allowTxnTransfers: event.currentTarget.checked,
                })
              }
              disabled={
                !canManageTransferCapability ||
                effectiveProject.projectType === 'programme' ||
                updateProject.isPending
              }
            />
          </Stack>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Project Standards Alignment</Title>
          <Text size="sm" c="dimmed">
            Synced projects can inherit company taxonomy, import rules, and
            auto-coding while still keeping justified project-only exceptions.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Badge
              variant="light"
              color={effectiveProject.syncCompanyDefaults ? 'teal' : 'gray'}
            >
              {effectiveProject.syncCompanyDefaults
                ? 'Company standards sync on'
                : 'Company standards sync off'}
            </Badge>
            <Badge variant="light">
              {(projectCategoriesQ.data?.length ?? 0) +
                (projectSubCategoriesQ.data?.length ?? 0)}{' '}
              taxonomy items
            </Badge>
            {taxonomyStateSummary.inherited > 0 ? (
              <Badge variant="light" color="teal">
                {taxonomyStateSummary.inherited} inherited taxonomy
              </Badge>
            ) : null}
            {taxonomyStateSummary.overridden > 0 ? (
              <Badge variant="light" color="orange">
                {taxonomyStateSummary.overridden} taxonomy overrides
              </Badge>
            ) : null}
            {taxonomyStateSummary.detached > 0 ? (
              <Badge variant="light" color="gray">
                {taxonomyStateSummary.detached} detached taxonomy
              </Badge>
            ) : null}
            <Badge variant="light">
              {autoCodingRuleStateSummary.local} project auto-coding rules
            </Badge>
            {autoCodingRuleStateSummary.inherited > 0 ? (
              <Badge variant="light" color="teal">
                {autoCodingRuleStateSummary.inherited} inherited auto-coding
              </Badge>
            ) : null}
            {autoCodingRuleStateSummary.overridden > 0 ? (
              <Badge variant="light" color="orange">
                {autoCodingRuleStateSummary.overridden} auto-coding overrides
              </Badge>
            ) : null}
            {autoCodingRuleStateSummary.detached > 0 ? (
              <Badge variant="light" color="gray">
                {autoCodingRuleStateSummary.detached} detached auto-coding
              </Badge>
            ) : null}
            <Badge variant="light">
              {projectImportRulesQ.data?.length ?? 0} project import rules
            </Badge>
            {importRuleStateSummary.inherited > 0 ? (
              <Badge variant="light" color="teal">
                {importRuleStateSummary.inherited} inherited import rules
              </Badge>
            ) : null}
            {importRuleStateSummary.overridden > 0 ? (
              <Badge variant="light" color="orange">
                {importRuleStateSummary.overridden} import rule overrides
              </Badge>
            ) : null}
            {importRuleStateSummary.detached > 0 ? (
              <Badge variant="light" color="gray">
                {importRuleStateSummary.detached} detached import rules
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            Use the category, auto-coding, and import-rule managers here to
            review inherited, overridden, and detached standards. Stable project
            patterns can be promoted up to the company standards set.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Button
              variant="light"
              disabled={
                effectiveProject.projectType !== 'project' || !canEditTaxonomy
              }
              loading={reapplyCompanyStandards.isPending}
              onClick={async () => {
                try {
                  const result = await reapplyCompanyStandards.mutateAsync();
                  if (!result.companyDefaultsConfigured) {
                    showAppToast({
                      tone: 'success',
                      title: 'Company standards reapplied',
                      message:
                        'Company import and auto-coding rules were resynced. No company taxonomy defaults are configured yet, so no categories or subcategories were added.',
                    });
                    return;
                  }
                  showAppToast({
                    tone: 'success',
                    title: 'Company standards reapplied',
                    message:
                      result.categoriesAdded === 0 &&
                      result.subCategoriesAdded === 0
                        ? 'Project taxonomy was refreshed and company import and auto-coding rules were resynced.'
                        : `Added ${result.categoriesAdded} categories and ${result.subCategoriesAdded} subcategories, then resynced company import and auto-coding rules.`,
                    autoClose: 9000,
                  });
                } catch (error) {
                  showAppToast({
                    tone: 'error',
                    title: 'Could not reapply company standards',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Please try again.',
                  });
                }
              }}
            >
              Reapply Company Standards
            </Button>
            <Button
              variant="light"
              disabled={
                effectiveProject.projectType !== 'project' || !canEditTaxonomy
              }
              onClick={() => setTaxonomyModalOpen(true)}
            >
              Manage Project Categories
            </Button>
            <Button
              variant="light"
              disabled={!canEditProject}
              onClick={() => setProjectRulesModalOpen(true)}
            >
              Manage Auto-Coding Rules
            </Button>
            <Button
              variant="light"
              disabled={!canEditProject}
              onClick={() => setProjectImportRulesModalOpen(true)}
            >
              Manage Import Rules
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Assign team members</Title>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="User (this company)"
              data={userOptions}
              value={memberUserId}
              onChange={(v) => setMemberUserId(v ? asUserId(v) : null)}
              searchable
              style={{ width: '100%', maxWidth: 420 }}
            />
            <Select
              label="Role"
              data={[
                { value: 'owner', label: 'owner' },
                { value: 'lead', label: 'lead' },
                { value: 'member', label: 'member' },
                { value: 'viewer', label: 'viewer' },
              ]}
              value={memberRole}
              onChange={(v) => setMemberRole(toProjectRole(v))}
              style={{ width: '100%', maxWidth: 220 }}
            />
            <Button
              size="sm"
              disabled={!canEditProject || !memberUserId || !memberRole}
              onClick={async () => {
                if (!memberUserId || !memberRole) return;
                await upsert.mutateAsync({
                  userId: memberUserId,
                  role: memberRole,
                });
              }}
            >
              Add to project
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Manage membership per project. Company settings manages
            company-level roles only.
          </Text>
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="lg">
        <Stack gap="sm">
          <Title order={5}>Current members</Title>
          <div className={classes.tableWrap}>
            {isHydrated ? (
              <MantineReactTable
                columns={memberColumns}
                data={memberRows}
                getRowId={(row) => row.key}
                mantineTableContainerProps={{ className: 'financeTable' }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                }}
                mantineTableBodyCellProps={{
                  style: { verticalAlign: 'middle' },
                }}
                enableColumnActions={false}
                enableColumnFilters={false}
                enableSorting
                enableTopToolbar={false}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                initialState={{
                  density: 'xs',
                  pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
                }}
              />
            ) : (
              <Paper className={classes.surfaceMuted} radius="xl" p="md">
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    Loading project members...
                  </Text>
                </Stack>
              </Paper>
            )}
          </div>
        </Stack>
      </Paper>

      <Modal
        opened={pendingSuperadminAccess !== null}
        onClose={() => setPendingSuperadminAccess(null)}
        title={toggleLabel}
        fullScreen={isMobile}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {toggleDescription}
          </Text>
          <Group justify="flex-end" wrap="wrap">
            <Button
              variant="light"
              onClick={() => setPendingSuperadminAccess(null)}
              fullWidth={isMobile}
            >
              Cancel
            </Button>
            <Button
              color={nextSuperadminAccess ? 'orange' : 'red'}
              fullWidth={isMobile}
              loading={updateProject.isPending}
              onClick={async () => {
                if (pendingSuperadminAccess === null) return;
                await updateProject.mutateAsync({
                  id: projectId,
                  allowSuperadminAccess: pendingSuperadminAccess,
                });
                const disablingWhileSuperadmin =
                  access.isSuperadmin && pendingSuperadminAccess === false;
                setPendingSuperadminAccess(null);
                if (disablingWhileSuperadmin) {
                  router.navigate({
                    to: companyRoute.to,
                    params: { companyId },
                  });
                }
              }}
            >
              {toggleLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ProjectAutoCodingRulesModal
        opened={projectRulesModalOpen}
        onClose={() => setProjectRulesModalOpen(false)}
        companyId={companyId}
        projectId={projectId}
        readOnly={!canEditProject}
      />
      <ProjectImportRulesModal
        opened={projectImportRulesModalOpen}
        onClose={() => setProjectImportRulesModalOpen(false)}
        companyId={companyId}
        projectId={projectId}
        readOnly={!canEditProject}
      />

      <TaxonomyManagerModal
        opened={taxonomyModalOpen}
        onClose={() => setTaxonomyModalOpen(false)}
        taxonomy={settingsTaxonomy}
        readOnly={!canEditTaxonomy}
      />
    </Stack>
  );
}

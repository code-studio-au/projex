import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import 'mantine-react-table-open/styles.css';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';

import { useIsHydrated } from '../hooks/useIsHydrated';
import type { CompanyId } from '../types';

import { companyRoute } from '../router';
import { Route as companiesRoute } from '../routes/_authed.companies';
import { useCompaniesQuery } from '../queries/reference';
import { useSessionQuery } from '../queries/session';
import {
  useCreateCompanyMutation,
  useDeactivateCompanyMutation,
  useDeleteCompanyMutation,
  useReactivateCompanyMutation,
} from '../queries/admin';
import { useCurrentUserQuery } from '../queries/account';
import classes from '../styles/ui.module.css';

function useLandingPageController() {
  const loaderData = companiesRoute.useLoaderData();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useIsHydrated();

  const sessionQ = useSessionQuery();
  const userId = sessionQ.data?.userId ?? loaderData.userId ?? undefined;

  const companiesQ = useCompaniesQuery(userId);
  const currentUserQ = useCurrentUserQuery();
  const isWaitingForSession =
    sessionQ.fetchStatus === 'fetching' && sessionQ.data == null;
  const isWaitingForFirstCompaniesLoad =
    !!userId &&
    companiesQ.fetchStatus === 'fetching' &&
    !companiesQ.data &&
    !loaderData.companies;

  const companies = useMemo(
    () => companiesQ.data ?? loaderData.companies ?? [],
    [companiesQ.data, loaderData.companies]
  );
  const sortedCompanies = useMemo(
    () =>
      [...companies].sort((a, b) => {
        if (a.status !== b.status) return a.status.localeCompare(b.status);
        return a.name.localeCompare(b.name);
      }),
    [companies]
  );
  const isSuperadmin =
    currentUserQ.data?.isGlobalSuperadmin ?? loaderData.isSuperadmin;

  const deactivateCompany = useDeactivateCompanyMutation();
  const reactivateCompany = useReactivateCompanyMutation();
  const deleteCompany = useDeleteCompanyMutation();
  const createCompany = useCreateCompanyMutation();

  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyAdminName, setNewCompanyAdminName] = useState('');
  const [newCompanyAdminEmail, setNewCompanyAdminEmail] = useState('');
  const [newCompanyStatus, setNewCompanyStatus] = useState<string | null>(null);
  const [newCompanyError, setNewCompanyError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate_company'; companyId: CompanyId; companyName: string }
    | { kind: 'reactivate_company'; companyId: CompanyId; companyName: string }
    | { kind: 'delete_company'; companyId: CompanyId; companyName: string }
    | null
  >(null);

  const openConfirm = useCallback(
    (target: NonNullable<typeof confirmTarget>) => {
      setConfirmTarget(target);
      setConfirmText('');
      setConfirmError(null);
      setConfirmOpen(true);
    },
    []
  );

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTarget(null);
    setConfirmText('');
    setConfirmError(null);
  };

  const confirmLabel = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_company')
      return 'Deactivate company';
    if (confirmTarget.kind === 'reactivate_company')
      return 'Reactivate company';
    return 'Delete company';
  }, [confirmTarget]);

  const confirmDescription = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_company') {
      return 'This will deactivate the company, archive all of its projects, and disable non-superadmin company users until the company is reactivated.';
    }
    if (confirmTarget.kind === 'reactivate_company') {
      return 'This will reactivate the company and reactivate all of its projects. Company users will be re-enabled for this company.';
    }
    return 'This permanently deletes the company and all related projects, budgets, transactions, taxonomy, and memberships. This cannot be undone. Type the exact destructive confirmation below.';
  }, [confirmTarget]);

  const requiredConfirmText = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'delete_company') {
      return `DELETE ${confirmTarget.companyName}`;
    }
    return confirmTarget.companyName;
  }, [confirmTarget]);

  const isConfirmMatch = useMemo(() => {
    if (!confirmTarget) return false;
    return confirmText.trim() === requiredConfirmText;
  }, [confirmText, confirmTarget, requiredConfirmText]);

  const companyColumns = useMemo<MRT_ColumnDef<(typeof companies)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Company',
        Cell: ({ row }) => (
          <Link
            to={companyRoute.to}
            params={{ companyId: row.original.id }}
            className={classes.plainLink}
          >
            <Text
              component="span"
              className="table-body-left-bold table-link-text"
            >
              {row.original.name}
            </Text>
          </Link>
        ),
      },
      {
        accessorKey: 'id',
        header: 'ID',
        Cell: ({ cell }) => (
          <Text className="table-body-left" c="dimmed">
            {cell.getValue<string>()}
          </Text>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        Cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge variant="light" color="green">
              Active
            </Badge>
          ) : (
            <Badge variant="light" color="gray">
              Deactivated
            </Badge>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 180,
        minSize: 180,
        Cell: ({ row }) => {
          const company = row.original;
          return (
            <Group gap="xs" wrap="nowrap">
              {isSuperadmin &&
                (company.status === 'active' ? (
                  <Button
                    size="xs"
                    variant="light"
                    color="orange"
                    onClick={() =>
                      openConfirm({
                        kind: 'deactivate_company',
                        companyId: company.id,
                        companyName: company.name,
                      })
                    }
                  >
                    Deactivate
                  </Button>
                ) : (
                  <>
                    <Button
                      size="xs"
                      variant="light"
                      color="green"
                      onClick={() =>
                        openConfirm({
                          kind: 'reactivate_company',
                          companyId: company.id,
                          companyName: company.name,
                        })
                      }
                    >
                      Reactivate
                    </Button>
                    <Button
                      size="xs"
                      variant="filled"
                      color="red"
                      onClick={() =>
                        openConfirm({
                          kind: 'delete_company',
                          companyId: company.id,
                          companyName: company.name,
                        })
                      }
                    >
                      Delete
                    </Button>
                  </>
                ))}
            </Group>
          );
        },
      },
    ],
    [isSuperadmin, openConfirm]
  );

  const loadingCompaniesPlaceholder = (
    <Paper className={classes.surfaceCard} p="lg" radius="xl">
      <Text c="dimmed" size="sm">
        Loading your companies...
      </Text>
    </Paper>
  );

  return {
    closeConfirm,
    companies,
    companyColumns,
    confirmDescription,
    confirmError,
    confirmLabel,
    confirmOpen,
    confirmTarget,
    confirmText,
    createCompany,
    deactivateCompany,
    deleteCompany,
    isConfirmMatch,
    isHydrated,
    isMobile,
    isSuperadmin,
    isWaitingForFirstCompaniesLoad,
    isWaitingForSession,
    loadingCompaniesPlaceholder,
    newCompanyAdminEmail,
    newCompanyAdminName,
    newCompanyError,
    newCompanyName,
    newCompanyOpen,
    newCompanyStatus,
    queryClient,
    reactivateCompany,
    requiredConfirmText,
    setConfirmError,
    setConfirmText,
    setNewCompanyAdminEmail,
    setNewCompanyAdminName,
    setNewCompanyError,
    setNewCompanyName,
    setNewCompanyOpen,
    setNewCompanyStatus,
    sortedCompanies,
  };
}

type LandingPageController = ReturnType<typeof useLandingPageController>;

function LandingPageView({ model }: { model: LandingPageController }) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.pageHero} radius="xl">
        <div className={classes.sectionHeader}>
          <div>
            <Text className={classes.sectionEyebrow}>Workspace</Text>
            <Title order={2} className={classes.pageHeroTitle} mt={4}>
              Companies
            </Title>
            <Text className={classes.pageHeroCopy} mt="xs">
              Open an existing company workspace, create a new company, or
              manage lifecycle actions from one calm admin surface.
            </Text>
          </div>
          <div className={classes.pageHeroActions}>
            {model.isSuperadmin ? (
              <>
                <Button
                  variant="filled"
                  onClick={() => model.setNewCompanyOpen(true)}
                >
                  New company
                </Button>
                <Modal
                  opened={model.newCompanyOpen}
                  onClose={() => model.setNewCompanyOpen(false)}
                  title="Create company"
                  fullScreen={model.isMobile}
                >
                  <Stack>
                    {model.newCompanyError ? (
                      <Alert color="red">{model.newCompanyError}</Alert>
                    ) : null}
                    {model.newCompanyStatus ? (
                      <Alert color="green">{model.newCompanyStatus}</Alert>
                    ) : null}
                    <TextInput
                      label="Company name"
                      placeholder="e.g. Northwind"
                      value={model.newCompanyName}
                      onChange={(e) =>
                        model.setNewCompanyName(e.currentTarget.value)
                      }
                      autoFocus
                    />
                    <Text size="sm" c="dimmed">
                      Assign the initial company admin now. A company cannot be
                      created without one, and the invite can be re-sent later
                      from company settings if needed.
                    </Text>
                    <TextInput
                      label="Initial admin name"
                      placeholder="e.g. Jane Admin"
                      value={model.newCompanyAdminName}
                      onChange={(e) =>
                        model.setNewCompanyAdminName(e.currentTarget.value)
                      }
                    />
                    <TextInput
                      label="Initial admin email"
                      placeholder="e.g. jane@example.com"
                      value={model.newCompanyAdminEmail}
                      onChange={(e) =>
                        model.setNewCompanyAdminEmail(e.currentTarget.value)
                      }
                    />
                    <Group justify="flex-end">
                      <Button
                        variant="default"
                        onClick={() => {
                          model.setNewCompanyOpen(false);
                          model.setNewCompanyError(null);
                          model.setNewCompanyStatus(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={
                          !model.newCompanyName.trim() ||
                          !model.newCompanyAdminName.trim() ||
                          !model.newCompanyAdminEmail.trim() ||
                          model.createCompany.isPending
                        }
                        onClick={async () => {
                          const name = model.newCompanyName.trim();
                          const adminName = model.newCompanyAdminName.trim();
                          const adminEmail = model.newCompanyAdminEmail.trim();
                          if (!name) return;
                          if (!adminName || !adminEmail) {
                            model.setNewCompanyError(
                              'Initial admin name and email are required when creating a company.'
                            );
                            model.setNewCompanyStatus(null);
                            return;
                          }
                          model.setNewCompanyError(null);
                          model.setNewCompanyStatus(null);
                          try {
                            const result =
                              await model.createCompany.mutateAsync({
                                name,
                                initialAdminName: adminName,
                                initialAdminEmail: adminEmail,
                              });
                            const company = result.company;
                            if (result.initialAdmin) {
                              await Promise.all([
                                model.queryClient.invalidateQueries({
                                  predicate: (q) =>
                                    Array.isArray(q.queryKey) &&
                                    q.queryKey[0] === 'users',
                                }),
                                model.queryClient.invalidateQueries({
                                  predicate: (q) =>
                                    Array.isArray(q.queryKey) &&
                                    [
                                      'companyMemberships',
                                      'allCompanyMemberships',
                                    ].includes(String(q.queryKey[0])),
                                }),
                              ]);
                              model.setNewCompanyStatus(
                                result.initialAdmin.onboardingEmailSent
                                  ? `${company.name} was created and ${result.initialAdmin.user.email} was invited as the initial admin. A password setup email is on its way.`
                                  : `${company.name} was created and ${result.initialAdmin.user.email} was added as the initial admin. You can send their password setup email later from company settings if needed.`
                              );
                            } else {
                              model.setNewCompanyStatus(
                                `${company.name} was created.`
                              );
                            }
                            model.setNewCompanyName('');
                            model.setNewCompanyAdminName('');
                            model.setNewCompanyAdminEmail('');
                            model.setNewCompanyOpen(false);
                          } catch (err) {
                            model.setNewCompanyError(
                              err instanceof Error
                                ? err.message
                                : 'Could not create company.'
                            );
                          }
                        }}
                      >
                        Create
                      </Button>
                    </Group>
                  </Stack>
                </Modal>
              </>
            ) : null}
          </div>
        </div>
      </Paper>

      {model.isWaitingForSession || model.isWaitingForFirstCompaniesLoad ? (
        model.loadingCompaniesPlaceholder
      ) : (
        <>
          {!model.isHydrated ? (
            model.loadingCompaniesPlaceholder
          ) : model.companies.length > 0 ? (
            <div className={classes.tableWrap}>
              <MantineReactTable
                columns={model.companyColumns}
                data={model.sortedCompanies}
                mantineTableContainerProps={{
                  className: 'financeTable companyListTable',
                }}
                enableColumnActions={false}
                enableColumnFilters={false}
                enableDensityToggle={false}
                enableFullScreenToggle={false}
                enableTopToolbar={false}
                enablePagination
                enableSorting
                initialState={{
                  density: 'xs',
                  pagination: {
                    pageIndex: 0,
                    pageSize: model.isMobile ? 5 : 8,
                  },
                }}
                mantineTableProps={{
                  highlightOnHover: true,
                  striped: 'odd',
                  withTableBorder: true,
                }}
              />
            </div>
          ) : (
            <Paper className={classes.surfaceCard} radius="xl" p="lg">
              <Text c="dimmed" size="sm">
                No companies are available for this account yet.
              </Text>
            </Paper>
          )}
        </>
      )}

      <Modal
        opened={model.confirmOpen}
        onClose={model.closeConfirm}
        title={model.confirmLabel}
        fullScreen={model.isMobile}
      >
        <Stack>
          {model.confirmError ? (
            <Alert color="red">{model.confirmError}</Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            {model.confirmDescription}
          </Text>

          <Text size="sm">
            Type <b>{model.requiredConfirmText}</b> to confirm.
          </Text>

          <TextInput
            value={model.confirmText}
            onChange={(e) => model.setConfirmText(e.currentTarget.value)}
            placeholder={
              model.confirmTarget?.kind === 'delete_company'
                ? 'DELETE company name'
                : 'Company name'
            }
            autoFocus
          />

          <Group justify="flex-end" wrap="wrap">
            <Button
              variant="default"
              onClick={model.closeConfirm}
              fullWidth={model.isMobile}
            >
              Cancel
            </Button>
            <Button
              fullWidth={model.isMobile}
              color={
                model.confirmTarget?.kind === 'delete_company'
                  ? 'red'
                  : model.confirmTarget?.kind === 'reactivate_company'
                    ? 'green'
                    : 'orange'
              }
              disabled={
                !model.isConfirmMatch ||
                model.deactivateCompany.isPending ||
                model.reactivateCompany.isPending ||
                model.deleteCompany.isPending
              }
              onClick={async () => {
                if (!model.confirmTarget) return;
                model.setConfirmError(null);
                try {
                  if (model.confirmTarget.kind === 'deactivate_company') {
                    await model.deactivateCompany.mutateAsync(
                      model.confirmTarget.companyId
                    );
                  } else if (
                    model.confirmTarget.kind === 'reactivate_company'
                  ) {
                    await model.reactivateCompany.mutateAsync(
                      model.confirmTarget.companyId
                    );
                  } else {
                    await model.deleteCompany.mutateAsync({
                      companyId: model.confirmTarget.companyId,
                      confirmation: model.confirmText,
                    });
                  }
                  model.closeConfirm();
                } catch (error) {
                  model.setConfirmError(
                    error instanceof Error
                      ? error.message
                      : 'Could not complete the company action.'
                  );
                }
              }}
            >
              {model.confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export default function LandingPage() {
  const model = useLandingPageController();
  return <LandingPageView model={model} />;
}

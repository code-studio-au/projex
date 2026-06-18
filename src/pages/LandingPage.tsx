import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { Link, useRouter } from '@tanstack/react-router';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';

import type { CompanyId } from '../types';

import { companyRoute } from '../router';
import { Route as companiesRoute } from '../routes/_authed.companies';
import {
  getDefaultCompanyIdForUser,
  useCompaniesQuery,
} from '../queries/reference';
import { useSessionQuery } from '../queries/session';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import {
  useCreateCompanyMutation,
  useDeactivateCompanyMutation,
  useDeleteCompanyMutation,
  useReactivateCompanyMutation,
} from '../queries/admin';
import { useCurrentUserQuery } from '../queries/account';
import classes from '../styles/ui.module.css';

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

export default function LandingPage() {
  const loaderData = companiesRoute.useLoaderData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );

  const sessionQ = useSessionQuery();
  const userId = sessionQ.data?.userId ?? loaderData.userId ?? undefined;

  const companiesQ = useCompaniesQuery(userId);
  const currentUserQ = useCurrentUserQuery();
  const membershipsQ = useAllCompanyMembershipsQuery();
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
  const userCompanyCount = useMemo(() => {
    if (!userId) return loaderData.userCompanyCount ?? 0;
    const ids = new Set(
      (membershipsQ.data ?? [])
        .filter((m) => m.userId === userId)
        .map((m) => m.companyId)
    );
    return ids.size || (loaderData.userCompanyCount ?? 0);
  }, [loaderData.userCompanyCount, membershipsQ.data, userId]);
  const shouldRedirect = useMemo(
    () => !!userId && !isSuperadmin && userCompanyCount === 1,
    [isSuperadmin, userCompanyCount, userId]
  );

  useEffect(() => {
    if (!shouldRedirect || !userId) return;
    let cancelled = false;
    (async () => {
      const companyId = await getDefaultCompanyIdForUser();
      if (!companyId || cancelled) return;
      router.navigate({ to: companyRoute.to, params: { companyId } });
    })();
    return () => {
      cancelled = true;
    };
  }, [router, shouldRedirect, userId]);

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
            <Badge variant="light">Active</Badge>
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
            {isSuperadmin ? (
              <>
                <Button
                  variant="filled"
                  onClick={() => setNewCompanyOpen(true)}
                >
                  New company
                </Button>
                <Modal
                  opened={newCompanyOpen}
                  onClose={() => setNewCompanyOpen(false)}
                  title="Create company"
                  fullScreen={isMobile}
                >
                  <Stack>
                    {newCompanyError ? (
                      <Alert color="red">{newCompanyError}</Alert>
                    ) : null}
                    {newCompanyStatus ? (
                      <Alert color="green">{newCompanyStatus}</Alert>
                    ) : null}
                    <TextInput
                      label="Company name"
                      placeholder="e.g. Northwind"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.currentTarget.value)}
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
                      value={newCompanyAdminName}
                      onChange={(e) =>
                        setNewCompanyAdminName(e.currentTarget.value)
                      }
                    />
                    <TextInput
                      label="Initial admin email"
                      placeholder="e.g. jane@example.com"
                      value={newCompanyAdminEmail}
                      onChange={(e) =>
                        setNewCompanyAdminEmail(e.currentTarget.value)
                      }
                    />
                    <Group justify="flex-end">
                      <Button
                        variant="light"
                        onClick={() => {
                          setNewCompanyOpen(false);
                          setNewCompanyError(null);
                          setNewCompanyStatus(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={
                          !newCompanyName.trim() ||
                          !newCompanyAdminName.trim() ||
                          !newCompanyAdminEmail.trim() ||
                          createCompany.isPending
                        }
                        onClick={async () => {
                          const name = newCompanyName.trim();
                          const adminName = newCompanyAdminName.trim();
                          const adminEmail = newCompanyAdminEmail.trim();
                          if (!name) return;
                          if (!adminName || !adminEmail) {
                            setNewCompanyError(
                              'Initial admin name and email are required when creating a company.'
                            );
                            setNewCompanyStatus(null);
                            return;
                          }
                          setNewCompanyError(null);
                          setNewCompanyStatus(null);
                          try {
                            const result = await createCompany.mutateAsync({
                              name,
                              initialAdminName: adminName || undefined,
                              initialAdminEmail: adminEmail || undefined,
                            });
                            const company = result.company;
                            if (result.initialAdmin) {
                              await Promise.all([
                                queryClient.invalidateQueries({
                                  predicate: (q) =>
                                    Array.isArray(q.queryKey) &&
                                    q.queryKey[0] === 'users',
                                }),
                                queryClient.invalidateQueries({
                                  predicate: (q) =>
                                    Array.isArray(q.queryKey) &&
                                    [
                                      'companyMemberships',
                                      'allCompanyMemberships',
                                    ].includes(String(q.queryKey[0])),
                                }),
                              ]);
                              setNewCompanyStatus(
                                result.initialAdmin.onboardingEmailSent
                                  ? `${company.name} was created and ${result.initialAdmin.user.email} was invited as the initial admin. A password setup email is on its way.`
                                  : `${company.name} was created and ${result.initialAdmin.user.email} was added as the initial admin. You can send their password setup email later from company settings if needed.`
                              );
                            } else {
                              setNewCompanyStatus(
                                `${company.name} was created.`
                              );
                            }
                            setNewCompanyName('');
                            setNewCompanyAdminName('');
                            setNewCompanyAdminEmail('');
                            setNewCompanyOpen(false);
                          } catch (err) {
                            setNewCompanyError(
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

      {shouldRedirect ? (
        <Paper className={classes.surfaceCard} p="lg" radius="xl">
          <Text c="dimmed">Redirecting to your company...</Text>
        </Paper>
      ) : isWaitingForSession || isWaitingForFirstCompaniesLoad ? (
        loadingCompaniesPlaceholder
      ) : (
        <>
          {!isHydrated ? (
            loadingCompaniesPlaceholder
          ) : companies.length > 0 ? (
            <div className={classes.tableWrap}>
              <MantineReactTable
                columns={companyColumns}
                data={sortedCompanies}
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
                  pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
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
        opened={confirmOpen}
        onClose={closeConfirm}
        title={confirmLabel}
        fullScreen={isMobile}
      >
        <Stack>
          {confirmError ? <Alert color="red">{confirmError}</Alert> : null}
          <Text size="sm" c="dimmed">
            {confirmDescription}
          </Text>

          <Text size="sm">
            Type <b>{requiredConfirmText}</b> to confirm.
          </Text>

          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder={
              confirmTarget?.kind === 'delete_company'
                ? 'DELETE company name'
                : 'Company name'
            }
            autoFocus
          />

          <Group justify="flex-end" wrap="wrap">
            <Button variant="light" onClick={closeConfirm} fullWidth={isMobile}>
              Cancel
            </Button>
            <Button
              fullWidth={isMobile}
              color={
                confirmTarget?.kind === 'delete_company'
                  ? 'red'
                  : confirmTarget?.kind === 'reactivate_company'
                    ? 'green'
                    : 'orange'
              }
              disabled={
                !isConfirmMatch ||
                deactivateCompany.isPending ||
                reactivateCompany.isPending ||
                deleteCompany.isPending
              }
              onClick={async () => {
                if (!confirmTarget) return;
                setConfirmError(null);
                try {
                  if (confirmTarget.kind === 'deactivate_company') {
                    await deactivateCompany.mutateAsync(
                      confirmTarget.companyId
                    );
                  } else if (confirmTarget.kind === 'reactivate_company') {
                    await reactivateCompany.mutateAsync(
                      confirmTarget.companyId
                    );
                  } else {
                    await deleteCompany.mutateAsync({
                      companyId: confirmTarget.companyId,
                      confirmation: confirmText,
                    });
                  }
                  closeConfirm();
                } catch (error) {
                  setConfirmError(
                    error instanceof Error
                      ? error.message
                      : 'Could not complete the company action.'
                  );
                }
              }}
            >
              {confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

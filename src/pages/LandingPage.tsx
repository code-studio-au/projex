import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';

import type { CompanyId } from '../types';

import { useApi } from '../hooks/useApi';
import { companyRoute } from '../router';
import { useCompaniesQuery } from '../queries/reference';
import { useSessionQuery } from '../queries/session';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import {
  useCreateCompanyMutation,
  useDeactivateCompanyMutation,
  useDeleteCompanyMutation,
  useReactivateCompanyMutation,
} from '../queries/admin';
import { qk } from '../queries/keys';

export default function LandingPage() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 48em)');

  const sessionQ = useSessionQuery();
  const userId = sessionQ.data?.userId;

  const companiesQ = useCompaniesQuery(userId);
  const membershipsQ = useAllCompanyMembershipsQuery();

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const sortedCompanies = useMemo(
    () =>
      [...companies].sort((a, b) => {
        if (a.status !== b.status) return a.status.localeCompare(b.status);
        return a.name.localeCompare(b.name);
      }),
    [companies]
  );
  const isSuperadmin = useMemo(() => {
    if (!userId) return false;
    return (membershipsQ.data ?? []).some((m) => m.userId === userId && m.role === 'superadmin');
  }, [membershipsQ.data, userId]);
  const userCompanyCount = useMemo(() => {
    if (!userId) return 0;
    const ids = new Set(
      (membershipsQ.data ?? []).filter((m) => m.userId === userId).map((m) => m.companyId)
    );
    return ids.size;
  }, [membershipsQ.data, userId]);
  const shouldRedirect = useMemo(
    () => !!userId && !isSuperadmin && userCompanyCount === 1,
    [isSuperadmin, userCompanyCount, userId]
  );

  useEffect(() => {
    if (!shouldRedirect || !userId) return;
    let cancelled = false;
    (async () => {
      const companyId = await api.getDefaultCompanyIdForUser(userId);
      if (!companyId || cancelled) return;
      router.navigate({ to: companyRoute.to, params: { companyId } });
    })();
    return () => {
      cancelled = true;
    };
  }, [api, router, shouldRedirect, userId]);

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
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate_company'; companyId: CompanyId; companyName: string }
    | { kind: 'reactivate_company'; companyId: CompanyId; companyName: string }
    | { kind: 'delete_company'; companyId: CompanyId; companyName: string }
    | null
  >(null);

  const openConfirm = useCallback((target: NonNullable<typeof confirmTarget>) => {
    setConfirmTarget(target);
    setConfirmText('');
    setConfirmOpen(true);
  }, []);

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTarget(null);
    setConfirmText('');
  };

  const confirmLabel = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_company') return 'Deactivate company';
    if (confirmTarget.kind === 'reactivate_company') return 'Reactivate company';
    return 'Delete company';
  }, [confirmTarget]);

  const confirmDescription = useMemo(() => {
    if (!confirmTarget) return '';
    if (confirmTarget.kind === 'deactivate_company') {
      return 'This will deactivate the company and archive all of its projects. Company users will be unable to use the company until reactivated (server mode can implement membership-level disable).';
    }
    if (confirmTarget.kind === 'reactivate_company') {
      return 'This will reactivate the company and reactivate all of its projects. Company users will be re-enabled for this company.';
    }
    return 'This permanently deletes the company and all related projects, budgets, transactions, taxonomy, and memberships. This cannot be undone.';
  }, [confirmTarget]);

  const isConfirmMatch = useMemo(() => {
    if (!confirmTarget) return false;
    return confirmText.trim() === confirmTarget.companyName;
  }, [confirmText, confirmTarget]);

  const companyColumns = useMemo<MRT_ColumnDef<(typeof companies)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Company',
      },
      {
        accessorKey: 'id',
        header: 'ID',
        Cell: ({ cell }) => (
          <Text size="sm" c="dimmed">
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
        size: 280,
        minSize: 280,
        Cell: ({ row }) => {
          const company = row.original;
          return (
            <Group gap="xs" wrap="nowrap">
              <Link to={companyRoute.to} params={{ companyId: company.id }}>
                <Button component="span" size="xs" variant={company.status === 'active' ? 'filled' : 'light'}>
                  {company.status === 'active' ? 'Open' : 'View'}
                </Button>
              </Link>

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

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>Companies</Title>
        {isSuperadmin ? (
          <>
            <Button variant="filled" onClick={() => setNewCompanyOpen(true)}>
              New company
            </Button>
            <Modal opened={newCompanyOpen} onClose={() => setNewCompanyOpen(false)} title="Create company" fullScreen={isMobile}>
              <Stack>
                {newCompanyError ? <Alert color="red">{newCompanyError}</Alert> : null}
                {newCompanyStatus ? <Alert color="green">{newCompanyStatus}</Alert> : null}
                <TextInput
                  label="Company name"
                  placeholder="e.g. Northwind"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.currentTarget.value)}
                  autoFocus
                />
                <Text size="sm" c="dimmed">
                  Optionally assign the initial company admin now. This is useful when onboarding a company for the first time, and the invite can be re-sent later from company settings if needed.
                </Text>
                <TextInput
                  label="Initial admin name"
                  placeholder="e.g. Jane Admin"
                  value={newCompanyAdminName}
                  onChange={(e) => setNewCompanyAdminName(e.currentTarget.value)}
                />
                <TextInput
                  label="Initial admin email"
                  placeholder="e.g. jane@example.com"
                  value={newCompanyAdminEmail}
                  onChange={(e) => setNewCompanyAdminEmail(e.currentTarget.value)}
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
                    disabled={!newCompanyName.trim() || createCompany.isPending}
                    onClick={async () => {
                      const name = newCompanyName.trim();
                      const adminName = newCompanyAdminName.trim();
                      const adminEmail = newCompanyAdminEmail.trim();
                      if (!name) return;
                      if ((adminName && !adminEmail) || (!adminName && adminEmail)) {
                        setNewCompanyError('Enter both initial admin name and email, or leave both blank.');
                        setNewCompanyStatus(null);
                        return;
                      }
                      setNewCompanyError(null);
                      setNewCompanyStatus(null);
                      try {
                        const company = await createCompany.mutateAsync({ name });
                        if (adminName && adminEmail) {
                          const result = await api.createUserInCompany(
                            company.id,
                            adminName,
                            adminEmail,
                            'admin'
                          );
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: qk.users() }),
                            queryClient.invalidateQueries({
                              predicate: (q) =>
                                Array.isArray(q.queryKey) &&
                                ['companyMemberships', 'allCompanyMemberships'].includes(
                                  String(q.queryKey[0])
                                ),
                            }),
                          ]);
                          setNewCompanyStatus(
                            result.onboardingEmailSent
                              ? `${company.name} was created and ${result.user.email} was invited as the initial admin. A password setup email is on its way.`
                              : `${company.name} was created and ${result.user.email} was added as the initial admin. You can send their password setup email later from company settings if needed.`
                          );
                        } else {
                          setNewCompanyStatus(`${company.name} was created.`);
                        }
                        setNewCompanyName('');
                        setNewCompanyAdminName('');
                        setNewCompanyAdminEmail('');
                        setNewCompanyOpen(false);
                      } catch (err) {
                        setNewCompanyError(
                          err instanceof Error ? err.message : 'Could not create company.'
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
      </Group>

      {shouldRedirect ? (
        <Text c="dimmed">Redirecting to your company...</Text>
      ) : (
        <>
          {companies.length > 0 ? (
            <MantineReactTable
              columns={companyColumns}
              data={sortedCompanies}
              mantineTableContainerProps={{ className: 'financeTable' }}
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
              mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
            />
          ) : (
            <Paper withBorder radius="lg" p="lg">
              <Text c="dimmed" size="sm">
                No companies are available for this account yet.
              </Text>
            </Paper>
          )}
        </>
      )}

      <Modal opened={confirmOpen} onClose={closeConfirm} title={confirmLabel} fullScreen={isMobile}>
        <Stack>
          <Text size="sm" c="dimmed">
            {confirmDescription}
          </Text>

          <Text size="sm">
            Type <b>{confirmTarget?.companyName ?? ''}</b> to confirm.
          </Text>

          <TextInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            placeholder="Company name"
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
                if (confirmTarget.kind === 'deactivate_company') {
                  await deactivateCompany.mutateAsync(confirmTarget.companyId);
                } else if (confirmTarget.kind === 'reactivate_company') {
                  await reactivateCompany.mutateAsync(confirmTarget.companyId);
                } else {
                  await deleteCompany.mutateAsync(confirmTarget.companyId);
                }
                closeConfirm();
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

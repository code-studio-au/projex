import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId } from '../types';

import { useApi } from '../hooks/useApi';
import { companyRoute, landingRoute, loginRoute } from '../router';
import { useCompaniesQuery } from '../queries/reference';
import { useLogoutMutation, useSessionQuery } from '../queries/session';
import { useAllCompanyMembershipsQuery } from '../queries/memberships';
import {
  useDeactivateCompanyMutation,
  useDeleteCompanyMutation,
  useReactivateCompanyMutation,
} from '../queries/admin';

export default function LandingPage() {
  const api = useApi();
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 48em)');

  const sessionQ = useSessionQuery();
  const userId = sessionQ.data?.userId;

  const logout = useLogoutMutation();
  const companiesQ = useCompaniesQuery(userId);
  const membershipsQ = useAllCompanyMembershipsQuery();

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const isSuperadmin = useMemo(() => {
    if (!userId) return false;
    return (membershipsQ.data ?? []).some((m) => m.userId === userId && m.role === 'superadmin');
  }, [membershipsQ.data, userId]);

  const deactivateCompany = useDeactivateCompanyMutation();
  const reactivateCompany = useReactivateCompanyMutation();
  const deleteCompany = useDeleteCompanyMutation();

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
        Cell: ({ row }) => {
          const company = row.original;
          return (
            <Group gap="xs" wrap="wrap">
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
    <Container size="lg" px={isMobile ? 'xs' : 'md'}>
      <Paper withBorder radius="lg" p={isMobile ? 'md' : 'xl'}>
        <Stack gap="md">
          <Title order={2}>Projex</Title>
          <Text c="dimmed">
            Local-first build with a clean API boundary + TanStack Router/Query. When you swap to
            TanStack Start later, the UI keeps the same shape.
          </Text>

          <Group justify="flex-end" wrap="wrap">
            {userId ? (
              <>
                <Button
                  variant="light"
                  onClick={async () => {
                    const companyId = await api.getDefaultCompanyIdForUser(userId);
                    if (companyId) {
                      router.navigate({
                        to: companyRoute.to,
                        params: { companyId },
                      });
                    } else {
                      router.navigate({ to: loginRoute.to });
                    }
                  }}
                >
                  Continue
                </Button>

                <Button
                  color="red"
                  variant="subtle"
                  onClick={() => {
                    logout.mutate(undefined, {
                      onSuccess: () => {
                        router.navigate({ to: landingRoute.to });
                      },
                    });
                  }}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Link to={loginRoute.to}>
                <Button component="span">Login</Button>
              </Link>
            )}
          </Group>

          {userId && (
            <Stack gap="sm" mt="md">
              <Group justify="space-between" align="center" wrap="wrap">
                <Text fw={700}>Company Directory</Text>
                <Badge variant="light">{companies.length} total</Badge>
              </Group>

              {companies.length > 0 ? (
                <MantineReactTable
                  columns={companyColumns}
                  data={companies}
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
                    sorting: [{ id: 'name', desc: false }],
                  }}
                  mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
                />
              ) : (
                <Text c="dimmed" size="sm">
                  No companies available for this user.
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

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
    </Container>
  );
}

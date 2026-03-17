import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Group, Modal, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId } from '../types';

import { useApi } from '../hooks/useApi';
import { companyRoute } from '../router';
import { useCompaniesQuery } from '../queries/reference';
import { useSessionQuery } from '../queries/session';
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

  const companiesQ = useCompaniesQuery(userId);
  const membershipsQ = useAllCompanyMembershipsQuery();

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const activeCount = useMemo(
    () => companies.filter((company) => company.status === 'active').length,
    [companies]
  );
  const deactivatedCount = companies.length - activeCount;
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
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={2}>Companies</Title>
        <Text c="dimmed">Choose a workspace, manage company lifecycle, and jump straight into delivery.</Text>
      </Stack>

      {shouldRedirect ? (
        <Text c="dimmed">Redirecting to your company...</Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Paper withBorder radius="lg" p="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total companies
              </Text>
              <Text fw={800} size="xl">
                {companies.length}
              </Text>
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Active
              </Text>
              <Text fw={800} size="xl">
                {activeCount}
              </Text>
            </Paper>
            <Paper withBorder radius="lg" p="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Deactivated
              </Text>
              <Text fw={800} size="xl">
                {deactivatedCount}
              </Text>
            </Paper>
          </SimpleGrid>

          <Group justify="space-between" align="center" wrap="wrap">
            <Text fw={700}>Companies</Text>
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

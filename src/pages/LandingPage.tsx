import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';

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

  const activeCompanies = useMemo(() => companies.filter((c) => c.status === 'active'), [companies]);
  const deactivatedCompanies = useMemo(
    () => companies.filter((c) => c.status === 'deactivated'),
    [companies]
  );

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

  const openConfirm = (target: NonNullable<typeof confirmTarget>) => {
    setConfirmTarget(target);
    setConfirmText('');
    setConfirmOpen(true);
  };

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

  return (
    <Container size="sm">
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={2}>Projex</Title>
          <Text c="dimmed">
            Local-first build with a clean API boundary + TanStack Router/Query. When you swap to
            TanStack Start later, the UI keeps the same shape.
          </Text>

          <Group justify="flex-end">
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
              <Text fw={700}>Companies</Text>

              {activeCompanies.length > 0 && (
                <>
                  <Text size="sm" c="dimmed">
                    Active
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    {activeCompanies.map((c) => (
                      <Card key={c.id} withBorder radius="lg" p="md">
                        <Stack gap={6}>
                          <Group justify="space-between" align="center">
                            <Text fw={700}>{c.name}</Text>
                            <Badge variant="light">Active</Badge>
                          </Group>

                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {c.id}
                          </Text>

                          <Group justify="space-between" mt="xs">
                            <Link to={companyRoute.to} params={{ companyId: c.id }}>
                              <Button component="span" variant="filled">
                                Open
                              </Button>
                            </Link>

                            {isSuperadmin && (
                              <Button
                                variant="light"
                                color="orange"
                                onClick={() =>
                                  openConfirm({
                                    kind: 'deactivate_company',
                                    companyId: c.id,
                                    companyName: c.name,
                                  })
                                }
                              >
                                Deactivate
                              </Button>
                            )}
                          </Group>
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>
                </>
              )}

              {isSuperadmin && (
                <>
                  <Text size="sm" c="dimmed" mt="md">
                    Deactivated
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    {deactivatedCompanies.map((c) => (
                      <Card key={c.id} withBorder radius="lg" p="md">
                        <Stack gap={6}>
                          <Group justify="space-between" align="center">
                            <Text fw={700}>{c.name}</Text>
                            <Badge variant="light" color="gray">
                              Deactivated
                            </Badge>
                          </Group>

                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {c.id}
                          </Text>

                          <Group justify="space-between" mt="xs">
                            <Link to={companyRoute.to} params={{ companyId: c.id }}>
                              <Button component="span" variant="light">
                                View
                              </Button>
                            </Link>

                            <Group gap="xs">
                              <Button
                                variant="light"
                                color="green"
                                onClick={() =>
                                  openConfirm({
                                    kind: 'reactivate_company',
                                    companyId: c.id,
                                    companyName: c.name,
                                  })
                                }
                              >
                                Reactivate
                              </Button>

                              <Button
                                variant="filled"
                                color="red"
                                onClick={() =>
                                  openConfirm({
                                    kind: 'delete_company',
                                    companyId: c.id,
                                    companyName: c.name,
                                  })
                                }
                              >
                                Delete
                              </Button>
                            </Group>
                          </Group>
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>

                  {deactivatedCompanies.length === 0 && (
                    <Text c="dimmed" size="sm">
                      No deactivated companies.
                    </Text>
                  )}
                </>
              )}

              {!isSuperadmin && activeCompanies.length === 0 && (
                <Text c="dimmed" size="sm">
                  No active companies available for this user.
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Card>

      <Modal opened={confirmOpen} onClose={closeConfirm} title={confirmLabel}>
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

          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
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

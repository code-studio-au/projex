import { useMemo } from 'react';
import { Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link, useRouter } from '@tanstack/react-router';
import { api } from '../api';
import { companyRoute } from '../router';
import { useCompaniesQuery } from '../queries/reference';
import { useLogoutMutation, useSessionQuery } from '../queries/session';

export default function LandingPage() {
  const router = useRouter();

  const sessionQ = useSessionQuery();
  const userId = sessionQ.data?.userId;

  const logout = useLogoutMutation();
  const companiesQ = useCompaniesQuery(userId);

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);

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
                      router.navigate({ to: '/login' });
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
                        router.navigate({ to: '/' });
                      },
                    });
                  }}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button component={Link} to="/login">
                Login
              </Button>
            )}
          </Group>

          {userId && (
            <Stack gap="sm" mt="md">
              <Text fw={700}>Companies</Text>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {companies.map((c) => (
                  <Card key={c.id} withBorder radius="lg" p="md">
                    <Stack gap={6}>
                      <Text fw={700}>{c.name}</Text>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {c.id}
                      </Text>

                      <Group justify="flex-end" mt="xs">
                        <Button
                          component={Link}
                          to={companyRoute.to}
                          params={{ companyId: c.id }}
                          variant="filled"
                        >
                          Open
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>

              {companies.length === 0 && (
                <Text c="dimmed" size="sm">
                  No companies available for this user.
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Card>
    </Container>
  );
}
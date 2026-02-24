import { Button, Card, Container, Group, Stack, Text, Title } from '@mantine/core';
import { Link, isNotFound, useRouter } from '@tanstack/react-router';

import { landingRoute } from '../router';

export function RootNotFoundComponent() {
  return (
    <Container size="sm" py="xl">
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={2}>Page not found</Title>
          <Text c="dimmed">
            That route doesn’t exist. If you followed a link, it may be outdated.
          </Text>
          <Group justify="flex-end">
            <Link to={landingRoute.to}>
              <Button component="span">Go home</Button>
            </Link>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}

export function RootErrorComponent(props: { error: unknown }) {
  const router = useRouter();

  const message =
    props.error instanceof Error
      ? props.error.message
      : typeof props.error === 'string'
        ? props.error
        : 'An unexpected error occurred.';

  const is404 = isNotFound(props.error);

  return (
    <Container size="sm" py="xl">
      <Card withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Title order={2}>{is404 ? 'Not found' : 'Something went wrong'}</Title>
          <Text c="dimmed">{message}</Text>

          <Group justify="flex-end">
            <Button
              variant="light"
              onClick={() => {
                router.invalidate();
              }}
            >
              Retry
            </Button>
            <Link to={landingRoute.to}>
              <Button component="span">Home</Button>
            </Link>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}

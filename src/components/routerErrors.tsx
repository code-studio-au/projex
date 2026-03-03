import { Badge, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link, isNotFound, useRouter } from '@tanstack/react-router';

import { homeRoute } from '../router';

export function RootNotFoundComponent() {
  return (
    <Container size="sm" py="xl">
      <Paper withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>Page not found</Title>
            <Badge variant="light" color="gray">
              404
            </Badge>
          </Group>
          <Text c="dimmed">
            That route doesn’t exist. If you followed a link, it may be outdated.
          </Text>
          <Group justify="flex-end">
            <Link to={homeRoute.to}>
              <Button component="span">Go home</Button>
            </Link>
          </Group>
        </Stack>
      </Paper>
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
      <Paper withBorder radius="lg" p="xl">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>{is404 ? 'Not found' : 'Something went wrong'}</Title>
            <Badge variant="light" color={is404 ? 'gray' : 'red'}>
              {is404 ? '404' : 'error'}
            </Badge>
          </Group>
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
            <Link to={homeRoute.to}>
              <Button component="span">Home</Button>
            </Link>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}

import { Badge, List, Paper, Stack, Text } from '@mantine/core';

import type { RoleDefinition } from '../../access/roleDefinitions';

export default function RolePermissionSummary<Role extends string>({
  definition,
}: {
  definition: RoleDefinition<Role>;
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Badge variant="light" w="fit-content">
          {definition.label}
        </Badge>
        <Text size="sm">{definition.summary}</Text>
        <List size="sm" spacing={4} withPadding>
          {definition.capabilities.map((capability) => (
            <List.Item key={capability}>{capability}</List.Item>
          ))}
        </List>
      </Stack>
    </Paper>
  );
}

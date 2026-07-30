import { Text } from '@mantine/core';
import type { MRT_ColumnDef } from 'mantine-react-table-open';

import type { ImportPreviewRow } from '../../types';

type ImportPreviewCellProps = Parameters<
  NonNullable<MRT_ColumnDef<ImportPreviewRow>['Cell']>
>[0];

export default function ImportPreviewTextCell({
  cell,
}: ImportPreviewCellProps) {
  return <Text className="table-body-left">{cell.getValue<string>()}</Text>;
}

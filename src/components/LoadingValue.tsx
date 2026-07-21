import { Skeleton } from '@mantine/core';

export function LoadingLine(props: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}) {
  const { width = '100%', height = 16, radius = 'sm' } = props;
  return <Skeleton visible width={width} height={height} radius={radius} />;
}

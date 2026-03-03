import type { QueryClient } from '@tanstack/react-query';
import type { ProjexApi } from './api/contract';

export type RouterContext = {
  api: ProjexApi;
  queryClient: QueryClient;
};

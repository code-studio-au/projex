import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiErrorFromBody } from '../api/errorResponses';
import type {
  CompanyExportDetail,
  CompanyExportJob,
  CompanyExportScope,
  CompanyId,
} from '../types';
import {
  readJsonResponseOrNull,
  readJsonResponseWithSchema,
} from '../utils/json';
import { omitUndefinedProperties } from '../utils/optionalProperties';
import { companyExportJobResponseSchema } from '../validation/responseSchemas';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { useSessionQuery } from './session';

export const COMPANY_EXPORT_POLL_INTERVAL_MS = 2000;

export type CreateCompanyExportInput = {
  scope: CompanyExportScope;
  detail: CompanyExportDetail;
  from?: string;
  to?: string;
  notifyWhenReady: boolean;
};

export function getCompanyExportPollingInterval(
  job: CompanyExportJob | null | undefined
): number | false {
  return job?.status === 'queued' || job?.status === 'running'
    ? COMPANY_EXPORT_POLL_INTERVAL_MS
    : false;
}

async function parseCompanyExportJobResponse(
  response: Response,
  options: { nullable: boolean; fallbackMessage: string }
): Promise<CompanyExportJob | null> {
  if (!response.ok) {
    throw apiErrorFromBody(
      await readJsonResponseOrNull(response),
      options.fallbackMessage
    );
  }

  const schema = options.nullable
    ? companyExportJobResponseSchema.nullable()
    : companyExportJobResponseSchema;
  const payload = await readJsonResponseWithSchema(response, schema);
  if (!payload.success) {
    throw apiErrorFromBody(null, 'Export job response was not valid JSON');
  }
  return payload.data === null ? null : omitUndefinedProperties(payload.data);
}

export function companyExportJobQueryOptions(args: {
  userId: string;
  companyId: CompanyId;
  jobId: string | null;
  enabled: boolean;
}) {
  const endpoint = args.jobId
    ? `/api/export-jobs/${encodeURIComponent(args.jobId)}`
    : `/api/companies/${encodeURIComponent(args.companyId)}/export-jobs`;

  return queryOptions({
    enabled: args.enabled,
    queryKey: qk.companyExportJob(args.userId, args.companyId, args.jobId),
    queryFn: async ({ signal }) => {
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal,
      });
      return parseCompanyExportJobResponse(response, {
        nullable: args.jobId === null,
        fallbackMessage: args.jobId
          ? 'Could not refresh export job status.'
          : 'Could not load the latest export.',
      });
    },
    refetchInterval: (query) =>
      getCompanyExportPollingInterval(query.state.data),
    retry: false,
    staleTime: COMPANY_EXPORT_POLL_INTERVAL_MS,
  });
}

export function useCompanyExportJobQuery(args: {
  companyId: CompanyId;
  jobId: string | null;
  enabled: boolean;
}) {
  const session = useSessionQuery();
  const scopeUserId = session.data?.userId ?? 'anonymous';
  return useQuery(
    companyExportJobQueryOptions({
      userId: scopeUserId,
      companyId: args.companyId,
      jobId: args.jobId,
      enabled: args.enabled && !!session.data?.userId,
    })
  );
}

async function createCompanyExportJob(
  companyId: CompanyId,
  input: CreateCompanyExportInput
): Promise<CompanyExportJob> {
  const response = await fetch(
    `/api/companies/${encodeURIComponent(companyId)}/export-jobs`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(input),
    }
  );
  const job = await parseCompanyExportJobResponse(response, {
    nullable: false,
    fallbackMessage: 'Could not start export.',
  });
  if (!job) {
    throw apiErrorFromBody(null, 'Export job response was empty');
  }
  return job;
}

export function useCreateCompanyExportJobMutation(companyId: CompanyId) {
  const queryClient = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (input: CreateCompanyExportInput) =>
      createCompanyExportJob(companyId, input),
    onSuccess: (job) => {
      queryClient.setQueryData(
        qk.companyExportJob(scopeUserId, companyId, null),
        job
      );
      queryClient.setQueryData(
        qk.companyExportJob(scopeUserId, companyId, job.id),
        job
      );
    },
  });
}

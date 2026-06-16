import { createServerFn } from '@tanstack/react-start';

import { asCompanyId, asProjectId } from '../../../types';
import type {
  ImportCandidateReviewInput,
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
  TxnImportPreviewInput,
} from '../../../api/contract';
import { asImportBatchId, asImportRuleId } from '../../../types';
import {
  createImportRuleServer,
  createProjectImportRuleServer,
  deleteImportRuleServer,
  deleteProjectImportRuleServer,
  listImportRulesServer,
  listProjectImportRulesServer,
  promoteProjectImportRuleServer,
  updateImportRuleServer,
  updateProjectImportRuleServer,
} from '../../fns/importRules';
import {
  cancelImportPreviewServer,
  listImportCandidatesServer,
  previewImportTransactionsServer,
  reviewImportCandidateServer,
} from '../../fns/transactions';
import { startApiMiddleware } from '../middleware';

export const listImportCandidatesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listImportCandidatesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const listImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return listImportRulesServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const reviewImportCandidateServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: ImportCandidateReviewInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return reviewImportCandidateServer({
      context: context.serverContext,
      projectId: data.projectId,
      candidateId: data.payload.candidateId,
      decision: data.payload.decision,
    });
  });

export const createImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { companyId: string; payload: ImportRuleCreateInput }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return createImportRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const listProjectImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listProjectImportRulesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: ImportRuleCreateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return createProjectImportRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { companyId: string; payload: ImportRuleUpdateInput }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateImportRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const deleteImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string; ruleId: string }) => ({
    companyId: asCompanyId(input.companyId),
    ruleId: asImportRuleId(input.ruleId),
  }))
  .handler(async ({ context, data }) => {
    return deleteImportRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      ruleId: data.ruleId,
    });
  });

export const updateProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: ImportRuleUpdateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateProjectImportRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; ruleId: string }) => ({
    projectId: asProjectId(input.projectId),
    ruleId: asImportRuleId(input.ruleId),
  }))
  .handler(async ({ context, data }) => {
    return deleteProjectImportRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      ruleId: data.ruleId,
    });
  });

export const promoteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; ruleId: string }) => ({
    projectId: asProjectId(input.projectId),
    ruleId: asImportRuleId(input.ruleId),
  }))
  .handler(async ({ context, data }) => {
    return promoteProjectImportRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      ruleId: data.ruleId,
    });
  });

export const previewImportTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: TxnImportPreviewInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return previewImportTransactionsServer({
      context: context.serverContext,
      projectId: data.projectId,
      csvText: data.payload.csvText,
      sourceType: data.payload.sourceType,
      fileName: data.payload.fileName,
      autoCreateStructures: data.payload.autoCreateStructures,
    });
  });

export const cancelImportPreviewServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; importBatchId: string }) => ({
    projectId: asProjectId(input.projectId),
    importBatchId: asImportBatchId(input.importBatchId),
  }))
  .handler(async ({ context, data }) => {
    return cancelImportPreviewServer({
      context: context.serverContext,
      projectId: data.projectId,
      importBatchId: data.importBatchId,
    });
  });

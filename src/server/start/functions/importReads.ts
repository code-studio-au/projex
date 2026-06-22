import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  companyIdSchema,
  createImportRuleInputSchema,
  importBatchIdParamSchema,
  importCandidateReviewInputSchema,
  importRuleIdSchema,
  projectIdSchema,
  txnImportPreviewInputSchema,
  updateImportRuleInputSchema,
} from '../../../validation/apiSchemas';
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
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const reviewImportCandidateServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: importCandidateReviewInputSchema,
});

const companyImportRuleServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createImportRuleInputSchema,
});

const projectImportRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createImportRuleInputSchema,
});

const updateCompanyImportRuleServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: updateImportRuleInputSchema,
});

const updateProjectImportRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateImportRuleInputSchema,
});

const deleteCompanyImportRuleServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  ruleId: importRuleIdSchema,
});

const deleteProjectImportRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  ruleId: importRuleIdSchema,
});

const previewImportTransactionsServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: txnImportPreviewInputSchema,
});

const cancelImportPreviewServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  importBatchId: importBatchIdParamSchema,
});

export const listImportCandidatesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listImportCandidatesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const listImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
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
    serverFnInputValidator(reviewImportCandidateServerFnInputSchema)
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
  .inputValidator(serverFnInputValidator(companyImportRuleServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createImportRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const listProjectImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
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
  .inputValidator(serverFnInputValidator(projectImportRuleServerFnInputSchema))
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
    serverFnInputValidator(updateCompanyImportRuleServerFnInputSchema)
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
  .inputValidator(
    serverFnInputValidator(deleteCompanyImportRuleServerFnInputSchema)
  )
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
    serverFnInputValidator(updateProjectImportRuleServerFnInputSchema)
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
  .inputValidator(
    serverFnInputValidator(deleteProjectImportRuleServerFnInputSchema)
  )
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
  .inputValidator(
    serverFnInputValidator(deleteProjectImportRuleServerFnInputSchema)
  )
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
    serverFnInputValidator(previewImportTransactionsServerFnInputSchema)
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
  .inputValidator(
    serverFnInputValidator(cancelImportPreviewServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return cancelImportPreviewServer({
      context: context.serverContext,
      projectId: data.projectId,
      importBatchId: data.importBatchId,
    });
  });

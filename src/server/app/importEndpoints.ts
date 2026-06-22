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
} from '../../validation/apiSchemas';
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
} from '../fns/importRules';
import {
  cancelImportPreviewServer,
  listImportCandidatesServer,
  previewImportTransactionsServer,
  reviewImportCandidateServer,
} from '../fns/transactions';
import { defineAppEndpoint } from './shared';

export const listImportCandidatesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listImportCandidatesServer({
      context,
      projectId: input.projectId,
    }),
});

export const listImportRulesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listImportRulesServer({
      context,
      companyId: input.companyId,
    }),
});

export const reviewImportCandidateEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: importCandidateReviewInputSchema,
  }),
  execute: ({ context, input }) =>
    reviewImportCandidateServer({
      context,
      projectId: input.projectId,
      candidateId: input.payload.candidateId,
      decision: input.payload.decision,
    }),
});

export const createImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createImportRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    createImportRuleServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const listProjectImportRulesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listProjectImportRulesServer({
      context,
      projectId: input.projectId,
    }),
});

export const createProjectImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createImportRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    createProjectImportRuleServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: updateImportRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    updateImportRuleServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const deleteImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    ruleId: importRuleIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteImportRuleServer({
      context,
      companyId: input.companyId,
      ruleId: input.ruleId,
    }),
});

export const updateProjectImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateImportRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    updateProjectImportRuleServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const deleteProjectImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    ruleId: importRuleIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteProjectImportRuleServer({
      context,
      projectId: input.projectId,
      ruleId: input.ruleId,
    }),
});

export const promoteProjectImportRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    ruleId: importRuleIdSchema,
  }),
  execute: ({ context, input }) =>
    promoteProjectImportRuleServer({
      context,
      projectId: input.projectId,
      ruleId: input.ruleId,
    }),
});

export const previewImportTransactionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnImportPreviewInputSchema,
  }),
  execute: ({ context, input }) =>
    previewImportTransactionsServer({
      context,
      projectId: input.projectId,
      csvText: input.payload.csvText,
      sourceType: input.payload.sourceType,
      fileName: input.payload.fileName,
      autoCreateStructures: input.payload.autoCreateStructures,
    }),
});

export const cancelImportPreviewEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    importBatchId: importBatchIdParamSchema,
  }),
  execute: ({ context, input }) =>
    cancelImportPreviewServer({
      context,
      projectId: input.projectId,
      importBatchId: input.importBatchId,
    }),
});

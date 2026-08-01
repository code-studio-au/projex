import { z } from 'zod';

import { omitUndefinedProperties } from '../../utils/optionalProperties';
import {
  backfillProjectCodingInputSchema,
  createProjectAutoCodingRuleInputSchema,
  projectAutoCodingRuleIdSchema,
  projectIdSchema,
  promoteProjectRuleToCompanyDefaultInputSchema,
  txnIdSchema,
  updateProjectAutoCodingRuleInputSchema,
} from '../../validation/apiSchemas';
import {
  backfillProjectCodingServer,
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
  listProjectAutoCodingRulesServer,
  promoteProjectRuleToCompanyDefaultServer,
  updateProjectAutoCodingRuleServer,
} from '../fns/projectAutoCodingRules';
import { defineAppEndpoint } from './shared';

export const getProjectRuleSuggestionPromptEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
  }),
  execute: ({ context, input }) =>
    getProjectRuleSuggestionPromptServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
    }),
});

export const listProjectAutoCodingRulesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listProjectAutoCodingRulesServer({
      context,
      projectId: input.projectId,
    }),
});

export const createProjectAutoCodingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createProjectAutoCodingRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    createProjectAutoCodingRuleServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateProjectAutoCodingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateProjectAutoCodingRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    updateProjectAutoCodingRuleServer({
      context,
      projectId: input.projectId,
      input: omitUndefinedProperties(input.payload),
    }),
});

export const deleteProjectAutoCodingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    ruleId: projectAutoCodingRuleIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteProjectAutoCodingRuleServer({
      context,
      projectId: input.projectId,
      ruleId: input.ruleId,
    }),
});

export const backfillProjectCodingEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: backfillProjectCodingInputSchema,
  }),
  execute: ({ context, input }) =>
    backfillProjectCodingServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const promoteProjectRuleToCompanyDefaultEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: promoteProjectRuleToCompanyDefaultInputSchema,
  }),
  execute: ({ context, input }) =>
    promoteProjectRuleToCompanyDefaultServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

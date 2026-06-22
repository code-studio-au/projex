import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  backfillProjectCodingInputSchema,
  createProjectAutoCodingRuleInputSchema,
  projectAutoCodingRuleIdSchema,
  projectIdSchema,
  promoteProjectRuleToCompanyDefaultInputSchema,
  txnIdSchema,
  updateProjectAutoCodingRuleInputSchema,
} from '../../../validation/apiSchemas';
import {
  backfillProjectCodingServer,
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
  listProjectAutoCodingRulesServer,
  promoteProjectRuleToCompanyDefaultServer,
  updateProjectAutoCodingRuleServer,
} from '../../fns/projectAutoCodingRules';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const projectIdTxnIdInputSchema = z.object({
  projectId: projectIdSchema,
  txnId: txnIdSchema,
});

const createProjectAutoCodingRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createProjectAutoCodingRuleInputSchema,
});

const updateProjectAutoCodingRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateProjectAutoCodingRuleInputSchema,
});

const deleteProjectAutoCodingRuleServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  ruleId: projectAutoCodingRuleIdSchema,
});

const backfillProjectCodingServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: backfillProjectCodingInputSchema,
});

const promoteProjectRuleToCompanyDefaultServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: promoteProjectRuleToCompanyDefaultInputSchema,
});

export const getProjectRuleSuggestionPromptServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdTxnIdInputSchema))
  .handler(async ({ context, data }) => {
    return getProjectRuleSuggestionPromptServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
    });
  });

export const createProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createProjectAutoCodingRuleServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return createProjectAutoCodingRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const listProjectAutoCodingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listProjectAutoCodingRulesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const updateProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateProjectAutoCodingRuleServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateProjectAutoCodingRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteProjectAutoCodingRuleServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return deleteProjectAutoCodingRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      ruleId: data.ruleId,
    });
  });

export const backfillProjectCodingServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(backfillProjectCodingServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return backfillProjectCodingServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const promoteProjectRuleToCompanyDefaultServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(
      promoteProjectRuleToCompanyDefaultServerFnInputSchema
    )
  )
  .handler(async ({ context, data }) => {
    return promoteProjectRuleToCompanyDefaultServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

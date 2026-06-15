import { createServerFn } from '@tanstack/react-start';

import {
  asCategoryId,
  asProjectId,
  asProjectAutoCodingRuleId,
  asSubCategoryId,
  asTxnId,
} from '../../../types';
import type {
  CreateProjectAutoCodingRuleInput,
  ProjectAutoCodingRuleUpdateInput,
} from '../../../api/contract';
import {
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
  listProjectAutoCodingRulesServer,
  updateProjectAutoCodingRuleServer,
} from '../../fns/projectAutoCodingRules';
import { startApiMiddleware } from '../middleware';

export const getProjectRuleSuggestionPromptServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; txnId: string }) => ({
    projectId: asProjectId(input.projectId),
    txnId: asTxnId(input.txnId),
  }))
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
    (input: {
      projectId: string;
      payload: CreateProjectAutoCodingRuleInput;
    }) => ({
      projectId: asProjectId(input.projectId),
      payload: {
        matchText: input.payload.matchText,
        categoryId: asCategoryId(String(input.payload.categoryId)),
        subCategoryId: asSubCategoryId(String(input.payload.subCategoryId)),
      },
    })
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
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
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
    (input: {
      projectId: string;
      payload: ProjectAutoCodingRuleUpdateInput;
    }) => ({
      projectId: asProjectId(input.projectId),
      payload: {
        id: asProjectAutoCodingRuleId(String(input.payload.id)),
        matchText: input.payload.matchText,
        categoryId:
          input.payload.categoryId == null
            ? undefined
            : asCategoryId(String(input.payload.categoryId)),
        subCategoryId:
          input.payload.subCategoryId == null
            ? undefined
            : asSubCategoryId(String(input.payload.subCategoryId)),
        sortOrder: input.payload.sortOrder,
      },
    })
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
  .inputValidator((input: { projectId: string; ruleId: string }) => ({
    projectId: asProjectId(input.projectId),
    ruleId: asProjectAutoCodingRuleId(input.ruleId),
  }))
  .handler(async ({ context, data }) => {
    return deleteProjectAutoCodingRuleServer({
      context: context.serverContext,
      projectId: data.projectId,
      ruleId: data.ruleId,
    });
  });

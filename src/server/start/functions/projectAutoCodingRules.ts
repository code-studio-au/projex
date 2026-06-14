import { createServerFn } from '@tanstack/react-start';

import {
  asCategoryId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../../../types';
import type { CreateProjectAutoCodingRuleInput } from '../../../api/contract';
import {
  createProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
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

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  companyIdSchema,
  ruleSuggestionAcceptInputSchema,
  ruleSuggestionDismissInputSchema,
} from '../../../validation/apiSchemas';
import {
  acceptRuleSuggestionServer,
  dismissRuleSuggestionServer,
  listRuleSuggestionsServer,
} from '../../fns/ruleSuggestions';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const acceptRuleSuggestionServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: ruleSuggestionAcceptInputSchema,
});

const dismissRuleSuggestionServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: ruleSuggestionDismissInputSchema,
});

export const listRuleSuggestionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listRuleSuggestionsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const acceptRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(acceptRuleSuggestionServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return acceptRuleSuggestionServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const dismissRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(dismissRuleSuggestionServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return dismissRuleSuggestionServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

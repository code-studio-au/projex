import { createServerFn } from '@tanstack/react-start';

import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asRuleSuggestionId,
} from '../../../types';
import type {
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
} from '../../../api/contract';
import {
  acceptRuleSuggestionServer,
  dismissRuleSuggestionServer,
  listRuleSuggestionsServer,
} from '../../fns/ruleSuggestions';
import { startApiMiddleware } from '../middleware';

export const listRuleSuggestionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return listRuleSuggestionsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const acceptRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { companyId: string; payload: RuleSuggestionAcceptInput }) => ({
      companyId: asCompanyId(input.companyId),
      payload: {
        id: asRuleSuggestionId(String(input.payload.id)),
        proposedMatchText: input.payload.proposedMatchText,
        companyDefaultCategoryId: asCompanyDefaultCategoryId(
          String(input.payload.companyDefaultCategoryId)
        ),
        companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
          String(input.payload.companyDefaultSubCategoryId)
        ),
      },
    })
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
    (input: { companyId: string; payload: RuleSuggestionDismissInput }) => ({
      companyId: asCompanyId(input.companyId),
      payload: {
        id: asRuleSuggestionId(String(input.payload.id)),
      },
    })
  )
  .handler(async ({ context, data }) => {
    return dismissRuleSuggestionServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

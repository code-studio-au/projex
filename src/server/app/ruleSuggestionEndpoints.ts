import { z } from 'zod';

import {
  companyIdSchema,
  ruleSuggestionAcceptInputSchema,
  ruleSuggestionDismissInputSchema,
} from '../../validation/apiSchemas';
import {
  acceptRuleSuggestionServer,
  dismissRuleSuggestionServer,
  listRuleSuggestionsServer,
} from '../fns/ruleSuggestions';
import { defineAppEndpoint } from './shared';

export const listRuleSuggestionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listRuleSuggestionsServer({
      context,
      companyId: input.companyId,
    }),
});

export const acceptRuleSuggestionEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: ruleSuggestionAcceptInputSchema,
  }),
  execute: ({ context, input }) =>
    acceptRuleSuggestionServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const dismissRuleSuggestionEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: ruleSuggestionDismissInputSchema,
  }),
  execute: ({ context, input }) =>
    dismissRuleSuggestionServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

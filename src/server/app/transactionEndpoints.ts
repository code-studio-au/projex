import { z } from 'zod';

import {
  createTxnCommentInputSchema,
  createTxnInputSchema,
  projectIdSchema,
  splitTxnInputSchema,
  transferTxnInputSchema,
  txnBulkActionInputSchema,
  txnCommentIdSchema,
  txnCommentSummariesInputSchema,
  txnIdSchema,
  txnImportInputSchema,
  txnReversalActionInputSchema,
  txnWorkflowStateInputSchema,
  updateTxnCommentInputSchema,
  updateTxnInputSchema,
} from '../../validation/apiSchemas';
import {
  applyTxnReversalActionServer,
  createTxnServer,
  deleteTxnServer,
  getTransactionServer,
  importTransactionsServer,
  listProjectTransactionSummaryServer,
  listTxnReversalMatchSuggestionsServer,
  listTransactionsServer,
  splitTxnServer,
  transferTxnServer,
  bulkTxnActionServer,
  updateTxnServer,
  updateTxnWorkflowStateServer,
} from '../fns/transactions';
import {
  createTransactionCommentServer,
  deleteTransactionCommentServer,
  listTransactionCommentSummariesServer,
  listTransactionCommentsServer,
  updateTransactionCommentServer,
} from '../fns/transactionComments';
import { defineAppEndpoint } from './shared';

export const listTransactionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listTransactionsServer({
      context,
      projectId: input.projectId,
    }),
});

export const getTransactionEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
  }),
  execute: ({ context, input }) =>
    getTransactionServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
    }),
});

export const listProjectTransactionSummaryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listProjectTransactionSummaryServer({
      context,
      projectId: input.projectId,
    }),
});

export const createTxnEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createTxnInputSchema,
  }),
  execute: ({ context, input }) =>
    createTxnServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateTxnEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateTxnInputSchema,
  }),
  execute: ({ context, input }) =>
    updateTxnServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const deleteTxnEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteTxnServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
    }),
});

export const splitTxnEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: splitTxnInputSchema,
  }),
  execute: ({ context, input }) =>
    splitTxnServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const transferTxnEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: transferTxnInputSchema,
  }),
  execute: ({ context, input }) =>
    transferTxnServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const listTxnReversalMatchSuggestionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
  }),
  execute: ({ context, input }) =>
    listTxnReversalMatchSuggestionsServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
    }),
});

export const applyTxnReversalActionEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnReversalActionInputSchema,
  }),
  execute: ({ context, input }) =>
    applyTxnReversalActionServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateTxnWorkflowStateEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnWorkflowStateInputSchema,
  }),
  execute: ({ context, input }) =>
    updateTxnWorkflowStateServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const bulkTxnActionEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnBulkActionInputSchema,
  }),
  execute: ({ context, input }) =>
    bulkTxnActionServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const importTransactionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnImportInputSchema,
  }),
  execute: ({ context, input }) =>
    importTransactionsServer({
      context,
      projectId: input.projectId,
      txns: input.payload.txns,
      mode: input.payload.mode,
      autoCreateBudgets: input.payload.autoCreateBudgets,
      importBatchId: input.payload.importBatchId,
      excludedImportIds: input.payload.excludedImportIds,
      reviewDecisions: input.payload.reviewDecisions,
    }),
});

export const listTransactionCommentsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
  }),
  execute: ({ context, input }) =>
    listTransactionCommentsServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
    }),
});

export const listTransactionCommentSummariesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: txnCommentSummariesInputSchema.optional(),
  }),
  execute: ({ context, input }) =>
    listTransactionCommentSummariesServer({
      context,
      projectId: input.projectId,
      txnIds: input.payload?.txnIds,
    }),
});

export const createTransactionCommentEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createTxnCommentInputSchema,
  }),
  execute: ({ context, input }) =>
    createTransactionCommentServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateTransactionCommentEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
    payload: updateTxnCommentInputSchema,
  }),
  execute: ({ context, input }) =>
    updateTransactionCommentServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
      input: input.payload,
    }),
});

export const deleteTransactionCommentEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    txnId: txnIdSchema,
    commentId: txnCommentIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteTransactionCommentServer({
      context,
      projectId: input.projectId,
      txnId: input.txnId,
      commentId: input.commentId,
    }),
});

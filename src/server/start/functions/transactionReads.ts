import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  createTxnCommentInputSchema,
  createTxnInputSchema,
  projectIdSchema,
  splitTxnInputSchema,
  transferTxnInputSchema,
  txnBulkActionInputSchema,
  txnCommentIdSchema,
  txnIdSchema,
  txnWorkflowStateInputSchema,
  updateTxnCommentInputSchema,
  updateTxnInputSchema,
} from '../../../validation/apiSchemas';
import {
  createTxnServer,
  deleteTxnServer,
  listTransactionsServer,
  splitTxnServer,
  transferTxnServer,
  bulkTxnActionServer,
  updateTxnServer,
  updateTxnWorkflowStateServer,
} from '../../fns/transactions';
import {
  createTransactionCommentServer,
  deleteTransactionCommentServer,
  listTransactionCommentSummariesServer,
  listTransactionCommentsServer,
  updateTransactionCommentServer,
} from '../../fns/transactionComments';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const projectIdTxnIdInputSchema = z.object({
  projectId: projectIdSchema,
  txnId: txnIdSchema,
});

const transactionCommentServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createTxnCommentInputSchema,
});

const updateTransactionCommentServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  txnId: txnIdSchema,
  payload: updateTxnCommentInputSchema,
});

const deleteTransactionCommentServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  txnId: txnIdSchema,
  commentId: txnCommentIdSchema,
});

const createTxnServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createTxnInputSchema,
});

const updateTxnServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateTxnInputSchema,
});

const splitTxnServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: splitTxnInputSchema,
});

const transferTxnServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: transferTxnInputSchema,
});

const updateTxnWorkflowStateServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: txnWorkflowStateInputSchema,
});

const bulkTxnActionServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: txnBulkActionInputSchema,
});

export const listTransactionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listTransactionsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const listTransactionCommentsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdTxnIdInputSchema))
  .handler(async ({ context, data }) => {
    return listTransactionCommentsServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
    });
  });

export const listTransactionCommentSummariesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listTransactionCommentSummariesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(transactionCommentServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createTransactionCommentServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateTransactionCommentServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateTransactionCommentServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
      input: data.payload,
    });
  });

export const deleteTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteTransactionCommentServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return deleteTransactionCommentServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
      commentId: data.commentId,
    });
  });

export const createTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createTxnServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateTxnServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdTxnIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
    });
  });

export const splitTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(splitTxnServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return splitTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const transferTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(transferTxnServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return transferTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateTxnWorkflowStateServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateTxnWorkflowStateServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateTxnWorkflowStateServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const bulkTxnActionServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(bulkTxnActionServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return bulkTxnActionServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

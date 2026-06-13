import { createServerFn } from '@tanstack/react-start';

import { asProjectId, asTxnId } from '../../../types';
import type {
  TxnCreateInput,
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../../../api/contract';
import { asTxnCommentId } from '../../../types';
import {
  createTxnServer,
  deleteTxnServer,
  listTransactionsServer,
  splitTxnServer,
  transferTxnServer,
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

export const listTransactionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listTransactionsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const listTransactionCommentsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; txnId: string }) => ({
    projectId: asProjectId(input.projectId),
    txnId: asTxnId(input.txnId),
  }))
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
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
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
  .inputValidator(
    (input: { projectId: string; payload: TxnCommentCreateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
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
    (input: {
      projectId: string;
      txnId: string;
      payload: TxnCommentUpdateInput;
    }) => ({
      projectId: asProjectId(input.projectId),
      txnId: asTxnId(input.txnId),
      payload: input.payload,
    })
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
    (input: { projectId: string; txnId: string; commentId: string }) => ({
      projectId: asProjectId(input.projectId),
      txnId: asTxnId(input.txnId),
      commentId: asTxnCommentId(input.commentId),
    })
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
  .inputValidator((input: { projectId: string; payload: TxnCreateInput }) => ({
    projectId: asProjectId(input.projectId),
    payload: input.payload,
  }))
  .handler(async ({ context, data }) => {
    return createTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; payload: TxnUpdateInput }) => ({
    projectId: asProjectId(input.projectId),
    payload: input.payload,
  }))
  .handler(async ({ context, data }) => {
    return updateTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; txnId: string }) => ({
    projectId: asProjectId(input.projectId),
    txnId: asTxnId(input.txnId),
  }))
  .handler(async ({ context, data }) => {
    return deleteTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      txnId: data.txnId,
    });
  });

export const splitTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; payload: TxnSplitInput }) => ({
    projectId: asProjectId(input.projectId),
    payload: input.payload,
  }))
  .handler(async ({ context, data }) => {
    return splitTxnServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const transferTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: TxnTransferInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
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
    (input: { projectId: string; payload: TxnWorkflowStateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateTxnWorkflowStateServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

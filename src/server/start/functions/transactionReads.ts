import { createServerFn } from '@tanstack/react-start';

import {
  bulkTxnActionEndpoint,
  createTransactionCommentEndpoint,
  createTxnEndpoint,
  deleteTransactionCommentEndpoint,
  deleteTxnEndpoint,
  listTransactionCommentSummariesEndpoint,
  listTransactionCommentsEndpoint,
  listTransactionsEndpoint,
  splitTxnEndpoint,
  transferTxnEndpoint,
  updateTransactionCommentEndpoint,
  updateTxnEndpoint,
  updateTxnWorkflowStateEndpoint,
} from '../../app/transactionEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listTransactionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listTransactionsEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listTransactionsEndpoint));

export const listTransactionCommentsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listTransactionCommentsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listTransactionCommentsEndpoint));

export const listTransactionCommentSummariesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listTransactionCommentSummariesEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(listTransactionCommentSummariesEndpoint)
  );

export const createTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createTransactionCommentEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(createTransactionCommentEndpoint));

export const updateTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateTransactionCommentEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateTransactionCommentEndpoint));

export const deleteTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteTransactionCommentEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteTransactionCommentEndpoint));

export const createTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createTxnEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createTxnEndpoint));

export const updateTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateTxnEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateTxnEndpoint));

export const deleteTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteTxnEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteTxnEndpoint));

export const splitTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(splitTxnEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(splitTxnEndpoint));

export const transferTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(transferTxnEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(transferTxnEndpoint));

export const updateTxnWorkflowStateServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateTxnWorkflowStateEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateTxnWorkflowStateEndpoint));

export const bulkTxnActionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(bulkTxnActionEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(bulkTxnActionEndpoint));

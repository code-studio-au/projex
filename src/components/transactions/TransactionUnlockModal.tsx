import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';

import type { TransactionActions } from '../../hooks/useTransactionActions';
import type { Txn } from '../../types';
import { showAppToast } from '../../utils/toast';

export default function TransactionUnlockModal(props: {
  txn: Txn;
  canResolveUnlock: boolean;
  canAdminUnlock: boolean;
  transactionActions: TransactionActions;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<
    'request' | 'approve' | 'reject' | 'admin' | null
  >(null);
  const request = props.txn.pendingUnlockRequest;
  const validReason = reason.trim().length >= 3;

  async function run(action: 'request' | 'approve' | 'reject' | 'admin') {
    if (!validReason) return;
    setSubmitting(action);
    try {
      if (action === 'request') {
        await props.transactionActions.requestUnlock({
          txnId: props.txn.id,
          expectedWorkflowVersion: props.txn.workflowVersion ?? 0,
          reason: reason.trim(),
        });
      } else if (action === 'admin') {
        await props.transactionActions.updateWorkflowState(props.txn.id, {
          expectedWorkflowVersion: props.txn.workflowVersion ?? 0,
          locked: false,
          reason: reason.trim(),
        });
      } else if (request) {
        await props.transactionActions.resolveUnlockRequest({
          requestId: request.id,
          expectedRequestVersion: request.version,
          decision: action === 'approve' ? 'approve' : 'reject',
          reason: reason.trim(),
        });
      }
      showAppToast({
        tone: action === 'reject' ? 'info' : 'success',
        title:
          action === 'request'
            ? 'Unlock requested'
            : action === 'reject'
              ? 'Unlock request rejected'
              : 'Transaction unlocked',
        message:
          action === 'request'
            ? 'The request is ready for an authorized reviewer.'
            : action === 'reject'
              ? 'The transaction remains locked.'
              : 'The transaction can now be edited.',
      });
      props.onClose();
    } catch (error) {
      showAppToast({
        tone: 'error',
        title: 'Workflow update failed',
        message:
          error instanceof Error
            ? error.message
            : 'The transaction workflow could not be updated.',
      });
    } finally {
      setSubmitting(null);
    }
  }

  const reviewing = Boolean(request && props.canResolveUnlock);
  return (
    <Modal
      opened
      onClose={props.onClose}
      title={reviewing ? 'Review unlock request' : 'Unlock transaction'}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" fw={600}>
          {props.txn.item}
        </Text>
        {request ? (
          <Alert color="blue" title="Pending request">
            {request.reason}
          </Alert>
        ) : (
          <Text size="sm" c="dimmed">
            Locked transactions remain protected until an authorized reviewer
            approves an unlock request.
          </Text>
        )}

        {request && !props.canResolveUnlock ? (
          <Text size="sm" c="dimmed">
            An authorized project lead or administrator must resolve this
            request.
          </Text>
        ) : (
          <Textarea
            label={reviewing ? 'Decision reason' : 'Reason for unlock'}
            description="This reason is stored in the immutable workflow history."
            minRows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            required
          />
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Close
          </Button>
          {request && props.canResolveUnlock ? (
            <>
              <Button
                color="red"
                variant="light"
                disabled={!validReason || submitting !== null}
                loading={submitting === 'reject'}
                onClick={() => void run('reject')}
              >
                Reject
              </Button>
              <Button
                disabled={!validReason || submitting !== null}
                loading={submitting === 'approve'}
                onClick={() => void run('approve')}
              >
                Approve and unlock
              </Button>
            </>
          ) : null}
          {!request ? (
            <Button
              disabled={!validReason || submitting !== null}
              loading={submitting === 'request'}
              onClick={() => void run('request')}
            >
              Request unlock
            </Button>
          ) : null}
          {!request && props.canAdminUnlock ? (
            <Button
              color="orange"
              variant="light"
              disabled={!validReason || submitting !== null}
              loading={submitting === 'admin'}
              onClick={() => void run('admin')}
            >
              Administrative unlock
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
  );
}

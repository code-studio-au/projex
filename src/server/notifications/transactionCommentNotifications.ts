import type {
  CompanyId,
  ProjectId,
  TxnCommentId,
  TxnId,
  UserId,
} from '../../types';
import { sendAuthEmail, type AuthEmailDelivery } from '../auth/email';
import { escapeEmailHtml } from '../email/html';
import { getPublicAppBaseUrl } from '../email/urls';

type UserEmailTarget = {
  id: UserId;
  email: string;
  name: string;
};

export function buildTransactionCommentUrl(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  txnId: TxnId;
  commentId: TxnCommentId;
}): string | null {
  const baseUrl = getPublicAppBaseUrl();
  if (!baseUrl) return null;

  const url = new URL(
    `/c/${encodeURIComponent(args.companyId)}/p/${encodeURIComponent(args.projectId)}`,
    baseUrl
  );
  url.searchParams.set('tab', 'transactions');
  url.searchParams.set('commentTxn', args.txnId);
  url.searchParams.set('commentId', args.commentId);
  return url.toString();
}

export async function sendTransactionCommentAssignmentEmail(args: {
  to: UserEmailTarget;
  actor: UserEmailTarget;
  companyName: string;
  projectName: string;
  txnItem: string;
  txnDescription: string;
  txnDate: string;
  commentBody: string;
  commentUrl: string | null;
}): Promise<AuthEmailDelivery> {
  const recipientName = args.to.name || args.to.email;
  const actorName = args.actor.name || args.actor.email;
  const txnLabel = [args.txnDate, args.txnItem].filter(Boolean).join(' - ');
  const linkLine = args.commentUrl
    ? ['Open the comment:', args.commentUrl, '']
    : [
        'Open Projex and go to the transaction comments to review this thread.',
        '',
      ];

  return sendAuthEmail({
    to: args.to.email,
    subject: `${actorName} mentioned you in a Projex transaction comment`,
    text: [
      `Hi ${recipientName},`,
      '',
      `${actorName} mentioned or assigned you in a transaction comment.`,
      '',
      `Company: ${args.companyName}`,
      `Project: ${args.projectName}`,
      `Transaction: ${txnLabel || args.txnItem || 'Transaction'}`,
      args.txnDescription ? `Description: ${args.txnDescription}` : '',
      '',
      'Comment:',
      args.commentBody,
      '',
      ...linkLine,
      'If this was not relevant to you, you can ignore this email.',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    html: [
      `<p>Hi ${escapeEmailHtml(recipientName)},</p>`,
      `<p>${escapeEmailHtml(actorName)} mentioned or assigned you in a transaction comment.</p>`,
      '<ul>',
      `<li><strong>Company:</strong> ${escapeEmailHtml(args.companyName)}</li>`,
      `<li><strong>Project:</strong> ${escapeEmailHtml(args.projectName)}</li>`,
      `<li><strong>Transaction:</strong> ${escapeEmailHtml(txnLabel || args.txnItem || 'Transaction')}</li>`,
      args.txnDescription
        ? `<li><strong>Description:</strong> ${escapeEmailHtml(args.txnDescription)}</li>`
        : '',
      '</ul>',
      `<blockquote>${escapeEmailHtml(args.commentBody)}</blockquote>`,
      args.commentUrl
        ? `<p><a href="${escapeEmailHtml(args.commentUrl)}">Open the comment in Projex</a></p>`
        : '<p>Open Projex and go to the transaction comments to review this thread.</p>',
      '<p>If this was not relevant to you, you can ignore this email.</p>',
    ].join(''),
  });
}

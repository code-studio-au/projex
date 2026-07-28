import { escapeEmailHtml } from './html.ts';

export function buildPasswordSetupEmailMessage(args: {
  recipientName: string;
  recipientEmail: string;
  url: string;
}) {
  const recipientName = args.recipientName || args.recipientEmail;

  return {
    subject: 'Set up your Projex password',
    text: [
      `Hi ${recipientName},`,
      '',
      'You have been invited to Projex.',
      'Use the link below to set your password:',
      args.url,
      '',
      'If you were not expecting this email, you can ignore it.',
    ].join('\n'),
    html: [
      `<p>Hi ${escapeEmailHtml(recipientName)},</p>`,
      '<p>You have been invited to Projex.</p>',
      `<p><a href="${escapeEmailHtml(args.url)}">Set your password</a></p>`,
      '<p>If you were not expecting this email, you can ignore it.</p>',
    ].join(''),
  };
}

export function buildEmailChangeVerificationMessage(args: {
  currentName: string;
  currentEmail: string;
  url: string;
}) {
  const recipientName = args.currentName || args.currentEmail;

  return {
    subject: 'Confirm your new Projex email address',
    text: [
      `Hi ${recipientName},`,
      '',
      'We received a request to change your Projex login email address.',
      'Confirm the new email address using the link below:',
      args.url,
      '',
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
    html: [
      `<p>Hi ${escapeEmailHtml(recipientName)},</p>`,
      '<p>We received a request to change your Projex login email address.</p>',
      `<p><a href="${escapeEmailHtml(args.url)}">Confirm your new email address</a></p>`,
      '<p>If you did not request this change, you can ignore this email.</p>',
    ].join(''),
  };
}

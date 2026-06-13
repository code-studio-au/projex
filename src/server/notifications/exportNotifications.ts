import type { CompanyExportJobId, CompanyId } from '../../types';
import { sendAuthEmail, type AuthEmailDelivery } from '../auth/email';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getAppBaseUrl(): string | null {
  return (
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.PROJEX_APP_BASE_URL?.trim() ||
    null
  );
}

export function buildCompanyExportReadyUrl(args: {
  companyId: CompanyId;
  jobId: CompanyExportJobId;
}): string | null {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) return null;

  const url = new URL(`/c/${encodeURIComponent(args.companyId)}`, baseUrl);
  url.searchParams.set('tab', 'settings');
  url.searchParams.set('exportJob', args.jobId);
  return url.toString();
}

export async function sendCompanyExportReadyEmail(args: {
  toEmail: string;
  toName: string;
  companyName: string;
  fileName: string;
  generatedAt: string;
  expiresAt?: string;
  readyUrl: string | null;
}): Promise<AuthEmailDelivery> {
  const recipientName = args.toName || args.toEmail;
  const linkBlock = args.readyUrl
    ? [
        '',
        'Open your export in Projex:',
        args.readyUrl,
        '',
        'If you are signed out, sign back in and the export will stay available until it expires.',
      ]
    : [
        '',
        'Open Projex and go to Company Settings to download the finished workbook.',
      ];

  return sendAuthEmail({
    to: args.toEmail,
    subject: `Your Projex export for ${args.companyName} is ready`,
    text: [
      `Hi ${recipientName},`,
      '',
      `Your company export is ready for download.`,
      '',
      `Company: ${args.companyName}`,
      `Workbook: ${args.fileName}`,
      `Generated at: ${args.generatedAt}`,
      args.expiresAt ? `Available until: ${args.expiresAt}` : '',
      ...linkBlock,
    ]
      .filter(Boolean)
      .join('\n'),
    html: [
      `<p>Hi ${escapeHtml(recipientName)},</p>`,
      '<p>Your company export is ready for download.</p>',
      '<ul>',
      `<li><strong>Company:</strong> ${escapeHtml(args.companyName)}</li>`,
      `<li><strong>Workbook:</strong> ${escapeHtml(args.fileName)}</li>`,
      `<li><strong>Generated at:</strong> ${escapeHtml(args.generatedAt)}</li>`,
      args.expiresAt
        ? `<li><strong>Available until:</strong> ${escapeHtml(args.expiresAt)}</li>`
        : '',
      '</ul>',
      args.readyUrl
        ? `<p><a href="${escapeHtml(args.readyUrl)}">Open your export in Projex</a></p><p>If you are signed out, sign back in and the export will stay available until it expires.</p>`
        : '<p>Open Projex and go to Company Settings to download the finished workbook.</p>',
    ].join(''),
  });
}

export type AuthEmailDelivery = 'email' | 'log';

type AuthEmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function getWebhookUrl(): string | null {
  const value = process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL?.trim();
  return value ? value : null;
}

function getWebhookBearerToken(): string | null {
  const value = process.env.PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN?.trim();
  return value ? value : null;
}

function getResendApiKey(): string | null {
  const value = process.env.RESEND_API_KEY?.trim();
  return value ? value : null;
}

function getResendBaseUrl(): string {
  return process.env.RESEND_BASE_URL?.trim() || 'https://api.resend.com';
}

function getResendFrom(): string | null {
  const value = process.env.RESEND_FROM?.trim();
  return value ? value : null;
}

export function getAuthEmailDeliveryMode(): AuthEmailDelivery {
  if (getResendApiKey() && getResendFrom()) return 'email';
  return getWebhookUrl() ? 'email' : 'log';
}

function assertValidResendConfig() {
  const from = getResendFrom();
  if (!from) return;

  if (/^https?:\/\//i.test(from)) {
    throw new Error(
      'RESEND_FROM must be an email sender value, not a URL. ' +
        'Example: Projex <noreply@projectexpensetracker.com>'
    );
  }
}

async function sendViaResend(
  payload: AuthEmailPayload
): Promise<AuthEmailDelivery> {
  const apiKey = getResendApiKey();
  const from = getResendFrom();
  if (!apiKey || !from) return 'log';

  assertValidResendConfig();

  const endpoint = `${getResendBaseUrl().replace(/\/$/, '')}/emails`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Resend delivery failed (${res.status}): ${text || 'empty response'}`
    );
  }

  return 'email';
}

export async function sendAuthEmail(
  payload: AuthEmailPayload
): Promise<AuthEmailDelivery> {
  if (getResendApiKey() && getResendFrom()) {
    return sendViaResend(payload);
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.info(
      '[auth-email] Email delivery not configured; logging message instead.',
      JSON.stringify(payload, null, 2)
    );
    return 'log';
  }

  const bearer = getWebhookBearerToken();
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Invite email delivery failed (${res.status}): ${text || 'empty response'}`
    );
  }

  return 'email';
}

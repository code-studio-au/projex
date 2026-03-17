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

export function getAuthEmailDeliveryMode(): AuthEmailDelivery {
  return getWebhookUrl() ? 'email' : 'log';
}

export async function sendAuthEmail(payload: AuthEmailPayload): Promise<AuthEmailDelivery> {
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

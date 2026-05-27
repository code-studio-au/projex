const CSP_NONCE_META_SELECTOR = 'meta[property="csp-nonce"]';

export function getDocumentCspNonce(doc: Document = document): string {
  return (
    doc
      .querySelector<HTMLMetaElement>(CSP_NONCE_META_SELECTOR)
      ?.getAttribute('content') ?? ''
  );
}

export function getCspNonce(): string {
  if (typeof document === 'undefined') return '';
  return getDocumentCspNonce(document);
}

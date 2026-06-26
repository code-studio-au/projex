export function uid(prefix = 'id'): string {
  const cryptoApi = globalThis.crypto as
    | {
        randomUUID?: () => string;
        getRandomValues?: (bytes: Uint8Array) => Uint8Array;
      }
    | undefined;
  if (!cryptoApi) {
    throw new Error('A Web Crypto implementation is required to generate ids');
  }

  const core =
    typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : randomHexFromCrypto(cryptoApi);
  return `${prefix}_${core}`;
}

function randomHexFromCrypto(cryptoApi: {
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
}) {
  if (typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is required to generate ids');
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

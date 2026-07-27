import { describe, expect, test } from 'vitest';

import { buildHostBootstrapCommands } from '../deploy/cdk/lib/hostBootstrap.ts';

describe('buildHostBootstrapCommands', () => {
  test('installs deploy-ready host assets and cert provisioning helpers', () => {
    const commands = buildHostBootstrapCommands();

    expect(commands).toContain('corepack enable');
    expect(commands).toContain('systemctl enable projex');
    expect(commands).toContain('systemctl restart nginx');

    const joined = commands.join('\n');
    expect(joined).toContain('/etc/nginx/conf.d/projex.conf');
    expect(joined).toContain('/etc/nginx/conf.d/projex-request-limits.conf');
    expect(joined).toContain('client_max_body_size 16m;');
    expect(joined).toContain('/etc/projex/projex.nginx.https.conf.template');
    expect(joined).toContain(
      '/usr/local/bin/projex-provision-letsencrypt-cert'
    );
    expect(joined).toContain('/var/www/certbot/.well-known/acme-challenge');
    expect(joined).toContain('/etc/projex/projex.env.example');
    expect(joined).toContain(
      'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem'
    );
    expect(joined).toContain(
      'PG_SSL_CA_FILE=/etc/projex/rds-global-bundle.pem'
    );
    expect(joined).toContain(
      'install -o root -g root -m 0644 "$PROJEX_RDS_CA_TMP" /etc/projex/rds-global-bundle.pem'
    );
  });
});

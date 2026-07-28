import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';

import {
  buildHostBootstrapCommands,
  buildHostBootstrapUserDataCommands,
  EC2_USER_DATA_MAX_BYTES,
} from '../deploy/cdk/lib/hostBootstrap.ts';

describe('buildHostBootstrapCommands', () => {
  test('installs deploy-ready host assets and cert provisioning helpers', () => {
    const commands = buildHostBootstrapCommands();

    expect(commands).toContain(
      'corepack enable pnpm --install-directory /usr/local/bin'
    );
    expect(commands).toContain('systemctl enable projex');
    expect(commands).toContain('systemctl restart nginx');

    const joined = commands.join('\n');
    expect(joined).not.toContain('rpm.nodesource.com');
    expect(joined).toContain(
      'https://nodejs.org/download/release/latest-v24.x/SHASUMS256.txt'
    );
    expect(joined).toContain('aarch64) PROJEX_NODE_ARCH=arm64');
    expect(joined).toContain('x86_64) PROJEX_NODE_ARCH=x64');
    expect(joined).toContain('sha256sum --check SHASUMS256-linux.txt');
    expect(joined).toContain(
      '/usr/local/lib/nodejs/$PROJEX_NODE_RELEASE_DIR/bin/$PROJEX_NODE_BINARY'
    );
    expect(joined).toContain(
      'tar --extract --xz --no-same-owner --file "$PROJEX_NODE_TMP/$PROJEX_NODE_ARCHIVE" --directory /usr/local/lib/nodejs'
    );
    expect(joined).toContain(
      'chown -R root:root "/usr/local/lib/nodejs/$PROJEX_NODE_RELEASE_DIR"'
    );
    expect(joined).toContain(
      'sudo -u ec2-user /usr/local/bin/corepack prepare pnpm@11.0.8 --activate'
    );
    expect(joined).toContain(
      'useradd --system --user-group --home-dir /var/lib/projex-deploy --create-home --shell /sbin/nologin projex-deploy'
    );
    expect(joined).toContain(
      'sudo -u projex-deploy /usr/local/bin/corepack prepare pnpm@11.0.8 --activate'
    );
    expect(commands).toContain('node --version');
    expect(commands).toContain('pnpm --version');
    expect(commands).toContain(
      'sudo -u projex-deploy /usr/local/bin/pnpm --version'
    );
    expect(commands).toContain(
      'sudo -u ec2-user /usr/local/bin/pnpm --version'
    );
    expect(joined).toContain('/etc/nginx/conf.d/projex.conf');
    expect(joined).toContain('/etc/nginx/conf.d/projex-request-limits.conf');
    expect(joined).toContain('client_max_body_size 16m;');
    expect(joined).toContain('/etc/projex/projex.nginx.https.conf.template');
    expect(joined).toContain(
      '/usr/local/bin/projex-provision-letsencrypt-cert'
    );
    expect(joined).toContain('/var/www/certbot/.well-known/acme-challenge');
    expect(joined).toContain('/etc/projex/projex.env.example');
    expect(joined).toContain('chown -R root:root /opt/projex');
    expect(joined).toContain('chown root:projex-deploy /etc/projex/projex.env');
    expect(joined).toContain('chmod 0640 /etc/projex/projex.env');
    expect(joined).toContain(
      'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem'
    );
    expect(joined).toContain(
      'PG_SSL_CA_FILE=/etc/projex/rds-global-bundle.pem'
    );
    expect(joined).toContain(
      "RESEND_FROM='Projex <noreply@projectexpensetracker.com>'"
    );
    expect(joined).toContain(
      'install -o root -g root -m 0644 "$PROJEX_RDS_CA_TMP" /etc/projex/rds-global-bundle.pem'
    );
  });

  test('compresses the complete bootstrap within the EC2 user-data limit', () => {
    const commands = buildHostBootstrapUserDataCommands();
    const renderedUserData = `#!/bin/bash\n${commands.join('\n')}\n`;
    const compressedPayload = commands
      .join('\n')
      .match(/printf '%s' '([A-Za-z0-9+/=]+)'/)?.[1];

    expect(Buffer.byteLength(renderedUserData, 'utf8')).toBeLessThanOrEqual(
      EC2_USER_DATA_MAX_BYTES
    );
    expect(compressedPayload).toBeDefined();

    const bootstrapScript = gunzipSync(
      Buffer.from(compressedPayload ?? '', 'base64')
    ).toString('utf8');

    expect(bootstrapScript).toBe(
      `${buildHostBootstrapCommands().join('\n')}\n`
    );
    expect(bootstrapScript).toContain('/etc/systemd/system/projex.service');
    expect(bootstrapScript).toContain(
      '/usr/local/bin/projex-provision-letsencrypt-cert'
    );
  });
});

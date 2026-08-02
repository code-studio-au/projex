import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageManagerVersion = '11.0.8';
const nodeReleaseBaseUrl = 'https://nodejs.org/download/release/latest-v24.x';
const rdsGlobalCaBundlePath = '/etc/projex/rds-global-bundle.pem';
const rdsGlobalCaBundleUrl =
  'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem';
const linuxUserDataShebang = '#!/bin/bash';

export const EC2_USER_DATA_MAX_BYTES = 16_384;

function repoRootFromCurrentFile() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(repoRootFromCurrentFile(), relativePath), 'utf8');
}

function heredocCommand(targetPath: string, content: string) {
  const delimiter = `PROJEX_${targetPath.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_EOF`;
  return `cat <<'${delimiter}' > ${targetPath}
${content}
${delimiter}`;
}

function installFileCommand(
  targetPath: string,
  content: string,
  mode: string,
  owner = 'root',
  group = 'root'
) {
  return `${heredocCommand(targetPath, content.trimEnd())}
chown ${owner}:${group} ${targetPath}
chmod ${mode} ${targetPath}`;
}

export function buildHostBootstrapCommands() {
  const systemdService = readRepoFile('deploy/systemd/projex.service');
  const journaldConfig = readRepoFile('deploy/systemd/projex-journald.conf');
  const bootstrapNginx = readRepoFile('deploy/nginx/projex.bootstrap.conf');
  const httpsNginxTemplate = readRepoFile(
    'deploy/nginx/projex.https.conf.template'
  );
  const nginxRequestLimits = readRepoFile(
    'deploy/nginx/projex-request-limits.conf'
  );
  const nginxCompression = readRepoFile('deploy/nginx/projex-compression.conf');
  const envExample = readRepoFile('.env.example');
  const hostEnvExample = envExample
    .replace('# PG_SSL_MODE=require', 'PG_SSL_MODE=require')
    .replace(
      '# PG_SSL_CA_FILE=/etc/projex/rds-global-bundle.pem',
      `PG_SSL_CA_FILE=${rdsGlobalCaBundlePath}`
    );
  const provisionLetsEncryptScript = readRepoFile(
    'scripts/provision-letsencrypt-cert.sh'
  );

  return [
    'set -euxo pipefail',
    'dnf update -y || yum update -y',
    'dnf install -y git nginx xz || yum install -y git nginx xz',
    'case "$(uname -m)" in aarch64) PROJEX_NODE_ARCH=arm64 ;; x86_64) PROJEX_NODE_ARCH=x64 ;; *) echo "Unsupported Node.js architecture: $(uname -m)" >&2; exit 1 ;; esac',
    'PROJEX_NODE_TMP="$(mktemp -d /tmp/projex-node-install.XXXXXX)"',
    'trap \'rm -rf -- "$PROJEX_NODE_TMP"\' EXIT',
    `curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 ${nodeReleaseBaseUrl}/SHASUMS256.txt --output "$PROJEX_NODE_TMP/SHASUMS256.txt"`,
    'PROJEX_NODE_ARCHIVE="$(awk -v arch="$PROJEX_NODE_ARCH" \'$2 ~ ("^node-v24[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") { print $2 }\' "$PROJEX_NODE_TMP/SHASUMS256.txt")"',
    'test -n "$PROJEX_NODE_ARCHIVE"',
    'test "$(printf \'%s\\n\' "$PROJEX_NODE_ARCHIVE" | wc -l)" -eq 1',
    'grep -F "  $PROJEX_NODE_ARCHIVE" "$PROJEX_NODE_TMP/SHASUMS256.txt" > "$PROJEX_NODE_TMP/SHASUMS256-linux.txt"',
    `curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "${nodeReleaseBaseUrl}/$PROJEX_NODE_ARCHIVE" --output "$PROJEX_NODE_TMP/$PROJEX_NODE_ARCHIVE"`,
    '(cd "$PROJEX_NODE_TMP" && sha256sum --check SHASUMS256-linux.txt)',
    'PROJEX_NODE_RELEASE_DIR="${PROJEX_NODE_ARCHIVE%.tar.xz}"',
    'install -d -m 0755 /usr/local/lib/nodejs',
    'tar --extract --xz --no-same-owner --file "$PROJEX_NODE_TMP/$PROJEX_NODE_ARCHIVE" --directory /usr/local/lib/nodejs',
    'chown -R root:root "/usr/local/lib/nodejs/$PROJEX_NODE_RELEASE_DIR"',
    'for PROJEX_NODE_BINARY in node npm npx corepack; do ln -sfn "/usr/local/lib/nodejs/$PROJEX_NODE_RELEASE_DIR/bin/$PROJEX_NODE_BINARY" "/usr/local/bin/$PROJEX_NODE_BINARY"; done',
    'corepack enable pnpm --install-directory /usr/local/bin',
    `corepack prepare pnpm@${packageManagerVersion} --activate`,
    'if ! id -u projex-deploy >/dev/null 2>&1; then useradd --system --user-group --home-dir /var/lib/projex-deploy --create-home --shell /sbin/nologin projex-deploy; fi',
    'install -d -o projex-deploy -g projex-deploy -m 0750 /var/lib/projex-deploy',
    `sudo -u projex-deploy /usr/local/bin/corepack prepare pnpm@${packageManagerVersion} --activate`,
    `sudo -u ec2-user /usr/local/bin/corepack prepare pnpm@${packageManagerVersion} --activate`,
    'node --version',
    'pnpm --version',
    'sudo -u projex-deploy /usr/local/bin/pnpm --version',
    'sudo -u ec2-user /usr/local/bin/pnpm --version',
    'rm -rf -- "$PROJEX_NODE_TMP"',
    'trap - EXIT',
    'install -d -m 0755 /opt/projex/releases /opt/projex/shared/nginx-maintenance /etc/projex /etc/systemd/journald.conf.d /var/www/certbot/.well-known/acme-challenge',
    'PROJEX_RDS_CA_TMP="$(mktemp /etc/projex/.rds-global-bundle.pem.XXXXXX)"',
    'trap \'rm -f -- "$PROJEX_RDS_CA_TMP"\' EXIT',
    `curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 ${rdsGlobalCaBundleUrl} --output "$PROJEX_RDS_CA_TMP"`,
    'grep -q -- "-----BEGIN CERTIFICATE-----" "$PROJEX_RDS_CA_TMP"',
    `install -o root -g root -m 0644 "$PROJEX_RDS_CA_TMP" ${rdsGlobalCaBundlePath}`,
    'rm -f -- "$PROJEX_RDS_CA_TMP"',
    'trap - EXIT',
    'chown -R root:root /opt/projex',
    installFileCommand(
      '/etc/projex/projex.env.example',
      hostEnvExample,
      '0600'
    ),
    'if [ ! -f /etc/projex/projex.env ]; then cp /etc/projex/projex.env.example /etc/projex/projex.env; fi',
    'chown root:projex-deploy /etc/projex/projex.env',
    'chmod 0640 /etc/projex/projex.env',
    installFileCommand(
      '/etc/systemd/system/projex.service',
      systemdService,
      '0644'
    ),
    installFileCommand(
      '/etc/systemd/journald.conf.d/60-projex-limits.conf',
      journaldConfig,
      '0644'
    ),
    installFileCommand('/etc/nginx/conf.d/projex.conf', bootstrapNginx, '0644'),
    installFileCommand(
      '/etc/nginx/conf.d/projex-request-limits.conf',
      nginxRequestLimits,
      '0644'
    ),
    installFileCommand(
      '/etc/nginx/conf.d/projex-compression.conf',
      nginxCompression,
      '0644'
    ),
    installFileCommand(
      '/etc/projex/projex.nginx.https.conf.template',
      httpsNginxTemplate,
      '0644'
    ),
    installFileCommand(
      '/usr/local/bin/projex-provision-letsencrypt-cert',
      provisionLetsEncryptScript,
      '0755'
    ),
    'systemctl daemon-reload',
    'systemctl restart systemd-journald',
    'systemctl enable projex',
    'systemctl enable nginx',
    'nginx -t',
    'systemctl restart nginx',
    'echo "Projex instance bootstrap complete" > /var/log/projex-bootstrap.log',
  ];
}

export function buildHostBootstrapUserDataCommands() {
  const bootstrapScript = `${buildHostBootstrapCommands().join('\n')}\n`;
  const compressedBootstrap = gzipSync(Buffer.from(bootstrapScript), {
    level: 9,
  }).toString('base64');
  const commands = [
    'set -euxo pipefail',
    `printf '%s' '${compressedBootstrap}' | base64 --decode | gzip --decompress | /bin/bash`,
  ];
  const renderedUserData = `${linuxUserDataShebang}\n${commands.join('\n')}\n`;
  const renderedBytes = Buffer.byteLength(renderedUserData, 'utf8');

  if (renderedBytes > EC2_USER_DATA_MAX_BYTES) {
    throw new Error(
      `EC2 user data is ${renderedBytes} bytes; the maximum is ${EC2_USER_DATA_MAX_BYTES} bytes`
    );
  }

  return commands;
}

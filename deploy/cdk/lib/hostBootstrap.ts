import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageManagerVersion = '11.0.8';

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
  const bootstrapNginx = readRepoFile('deploy/nginx/projex.bootstrap.conf');
  const httpsNginxTemplate = readRepoFile('deploy/nginx/projex.https.conf.template');
  const envExample = readRepoFile('.env.example');
  const provisionLetsEncryptScript = readRepoFile(
    'scripts/provision-letsencrypt-cert.sh'
  );

  return [
    'set -euxo pipefail',
    'dnf update -y || yum update -y',
    'dnf install -y git nginx || yum install -y git nginx',
    'curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -',
    'dnf install -y nodejs || yum install -y nodejs',
    'corepack enable',
    `corepack prepare pnpm@${packageManagerVersion} --activate`,
    'install -d -m 0755 /opt/projex/releases /opt/projex/shared/nginx-maintenance /etc/projex /var/www/certbot/.well-known/acme-challenge',
    'chown -R ec2-user:ec2-user /opt/projex',
    installFileCommand(
      '/etc/projex/projex.env.example',
      envExample,
      '0600'
    ),
    "if [ ! -f /etc/projex/projex.env ]; then cp /etc/projex/projex.env.example /etc/projex/projex.env; chmod 0600 /etc/projex/projex.env; fi",
    installFileCommand(
      '/etc/systemd/system/projex.service',
      systemdService,
      '0644'
    ),
    installFileCommand(
      '/etc/nginx/conf.d/projex.conf',
      bootstrapNginx,
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
    'systemctl enable projex',
    'systemctl enable nginx',
    'nginx -t',
    'systemctl restart nginx',
    'echo "Projex instance bootstrap complete" > /var/log/projex-bootstrap.log',
  ];
}

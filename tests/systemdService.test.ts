import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

const servicePath = new URL(
  '../deploy/systemd/projex.service',
  import.meta.url
);

describe('projex systemd service', () => {
  test('runs the application with a read-only, capability-free sandbox', async () => {
    const service = await readFile(servicePath, 'utf8');
    const directives = new Set(
      service
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    for (const directive of [
      'User=ec2-user',
      'Group=ec2-user',
      'UMask=0077',
      'StateDirectory=projex',
      'StateDirectoryMode=0750',
      'ReadWritePaths=/var/lib/projex',
      'NoNewPrivileges=true',
      'PrivateDevices=true',
      'PrivateMounts=true',
      'PrivateTmp=true',
      'ProtectClock=true',
      'ProtectControlGroups=true',
      'ProtectHome=true',
      'ProtectHostname=true',
      'ProtectKernelLogs=true',
      'ProtectKernelModules=true',
      'ProtectKernelTunables=true',
      'ProtectProc=invisible',
      'ProtectSystem=strict',
      'ProcSubset=pid',
      'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
      'RestrictNamespaces=true',
      'RestrictRealtime=true',
      'RestrictSUIDSGID=true',
      'RemoveIPC=true',
      'LockPersonality=true',
      'CapabilityBoundingSet=',
      'AmbientCapabilities=',
      'SystemCallArchitectures=native',
      'StandardOutput=journal',
      'StandardError=journal',
      'LogRateLimitIntervalSec=30s',
      'LogRateLimitBurst=1000',
    ]) {
      expect(directives.has(directive), directive).toBe(true);
    }

    expect(service).toContain(
      'ExecStart=/usr/local/bin/node --import tsx scripts/start-server.mjs'
    );
    expect(service).not.toMatch(/^ExecStart=.*\bpnpm\b/m);
  });
});

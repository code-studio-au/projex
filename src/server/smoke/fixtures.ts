import { randomBytes } from 'node:crypto';

import { getBetterAuthInstance } from '../auth/betterAuthInstance.ts';
import { createPgPool, type TypedPgPool } from '../db/pgPool.ts';
import { betterAuthSignUpResponseSchema } from '../../validation/responseSchemas.ts';
import { loadSmokeEnvFiles } from './env.ts';

type SmokeFixtureUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

export type SmokeFixtures = {
  runId: string;
  companyId: string;
  projectId: string;
  users: {
    primary: SmokeFixtureUser;
    privacyAdmin: SmokeFixtureUser;
    privacySuperadmin: SmokeFixtureUser;
  };
  inviteEmail: string;
  emailChangeTo: string;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type ForeignKeyReference = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

type SmokeFixtureOptions = {
  sweepStale?: boolean;
  onStatus?: (message: string) => void | Promise<void>;
};

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required for smoke fixtures');
  return value;
}

function generatedEmailDomain() {
  return (
    process.env.PROJEX_SMOKE_GENERATED_EMAIL_DOMAIN?.trim() || 'example.invalid'
  );
}

function makeRunId() {
  return `${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

function makePassword(runId: string) {
  return `Smoke-${runId}-Password-123!`;
}

function makeUser(role: string, runId: string): SmokeFixtureUser {
  const email = `smoke_${role}_${runId}@${generatedEmailDomain()}`;
  return {
    id: '',
    email,
    password: makePassword(runId),
    name: `Smoke ${role.replace(/_/g, ' ')}`,
  };
}

async function emit(
  options: SmokeFixtureOptions,
  message: string
): Promise<void> {
  await options.onStatus?.(message);
}

async function signUpFixtureUser(user: SmokeFixtureUser): Promise<AuthUser> {
  const auth = getBetterAuthInstance();
  const response = await auth.api.signUpEmail({
    body: {
      email: user.email,
      password: user.password,
      name: user.name,
    },
  });
  const payload = betterAuthSignUpResponseSchema.parse(response);
  return {
    id: payload.user.id,
    email: payload.user.email ?? user.email,
    name: payload.user.name ?? user.name,
  };
}

async function ensureAppUser(
  pool: TypedPgPool,
  user: AuthUser,
  isGlobalSuperadmin: boolean
) {
  await pool.query(
    `insert into users (id, email, name, disabled, is_global_superadmin)
     values ($1, $2, $3, false, $4)
     on conflict (id) do update
     set email = excluded.email,
         name = excluded.name,
         disabled = false,
         is_global_superadmin = excluded.is_global_superadmin`,
    [user.id, user.email, user.name, isGlobalSuperadmin]
  );
}

async function ensureSmokeCompanyAndProject(
  pool: TypedPgPool,
  fixtures: SmokeFixtures
) {
  await pool.query(
    `insert into companies (id, name, status, deactivated_at)
     values ($1, $2, 'active', null)
     on conflict (id) do update
     set name = excluded.name,
         status = 'active',
         deactivated_at = null`,
    [fixtures.companyId, `Smoke Company ${fixtures.runId}`]
  );

  await pool.query(
    `insert into projects (
       id,
       company_id,
       name,
       budget_total_cents,
       currency,
       status,
       deactivated_at,
       visibility,
       allow_superadmin_access
     )
     values ($1, $2, $3, 0, 'AUD', 'active', null, 'private', true)
     on conflict (id) do update
     set name = excluded.name,
         status = 'active',
         deactivated_at = null,
         visibility = 'private',
         allow_superadmin_access = true`,
    [fixtures.projectId, fixtures.companyId, `Smoke Project ${fixtures.runId}`]
  );
}

async function ensureFixtureMemberships(
  pool: TypedPgPool,
  fixtures: SmokeFixtures
) {
  for (const user of [fixtures.users.primary, fixtures.users.privacyAdmin]) {
    await pool.query(
      `insert into company_memberships (company_id, user_id, role)
       values ($1, $2, 'admin')
       on conflict (company_id, user_id) do update
       set role = excluded.role`,
      [fixtures.companyId, user.id]
    );

    await pool.query(
      `insert into project_memberships (project_id, user_id, role)
       values ($1, $2, 'owner')
       on conflict (project_id, user_id) do update
       set role = excluded.role`,
      [fixtures.projectId, user.id]
    );
  }
}

export function applySmokeFixtureEnv(fixtures: SmokeFixtures) {
  process.env.PROJEX_SMOKE_COMPANY_ID = fixtures.companyId;
  process.env.PROJEX_SMOKE_PROJECT_ID = fixtures.projectId;
  process.env.PROJEX_SMOKE_EMAIL = fixtures.users.primary.email;
  process.env.PROJEX_SMOKE_PASSWORD = fixtures.users.primary.password;
  process.env.PROJEX_SMOKE_RESET_EMAIL = fixtures.users.primary.email;
  process.env.PROJEX_SMOKE_EMAIL_CHANGE_TO = fixtures.emailChangeTo;
  process.env.PROJEX_SMOKE_INVITE_EMAIL = fixtures.inviteEmail;
  process.env.PROJEX_SMOKE_INVITE_NAME = `Smoke Invite ${fixtures.runId}`;
  process.env.PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL =
    fixtures.users.privacyAdmin.email;
  process.env.PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD =
    fixtures.users.privacyAdmin.password;
  process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL =
    fixtures.users.privacySuperadmin.email;
  process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD =
    fixtures.users.privacySuperadmin.password;
}

export async function createSmokeFixtures(
  options: SmokeFixtureOptions = {}
): Promise<SmokeFixtures> {
  loadSmokeEnvFiles();
  const pool = createPgPool(requireDatabaseUrl());
  const runId = makeRunId();
  const fixtures: SmokeFixtures = {
    runId,
    companyId: `co_smoke_${runId}`,
    projectId: `prj_smoke_${runId}`,
    users: {
      primary: makeUser('primary', runId),
      privacyAdmin: makeUser('privacy_admin', runId),
      privacySuperadmin: makeUser('privacy_superadmin', runId),
    },
    inviteEmail: `smoke_invite_${runId}@${generatedEmailDomain()}`,
    emailChangeTo: `smoke_email_change_${runId}@${generatedEmailDomain()}`,
  };

  try {
    if (options.sweepStale) {
      await sweepSmokeFixtures({ ...options, pool });
    }

    await emit(options, `Creating smoke fixtures for run ${runId}`);
    for (const [key, fixtureUser] of Object.entries(fixtures.users)) {
      const authUser = await signUpFixtureUser(fixtureUser);
      fixtureUser.id = authUser.id;
      await ensureAppUser(pool, authUser, key !== 'privacyAdmin');
    }

    await ensureSmokeCompanyAndProject(pool, fixtures);
    await ensureFixtureMemberships(pool, fixtures);
    applySmokeFixtureEnv(fixtures);
    await emit(
      options,
      `Smoke fixtures ready: ${fixtures.companyId}/${fixtures.projectId}`
    );
    return fixtures;
  } catch (error) {
    await cleanupSmokeFixtures(fixtures, { ...options, pool });
    throw error;
  } finally {
    await pool.end();
  }
}

async function deleteBetterAuthUsersByEmail(
  pool: TypedPgPool,
  emails: string[]
) {
  if (emails.length === 0) return;
  const users = await pool.query<{ id: string }>(
    `select id from ba_user where lower(email) = any($1)`,
    [emails.map((email) => email.toLowerCase())]
  );
  const userIds = users.rows.map((user) => user.id);
  if (userIds.length === 0) return;

  await deleteRowsReferencingBetterAuthUsers(pool, userIds);
  await pool.query(`delete from ba_user where id = any($1)`, [userIds]);
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function deleteRowsReferencingBetterAuthUsers(
  pool: TypedPgPool,
  userIds: string[]
) {
  const references = await pool.query<ForeignKeyReference>(
    `select
       kcu.table_schema,
       kcu.table_name,
       kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and ccu.table_name = 'ba_user'
       and ccu.column_name = 'id'`,
    []
  );

  for (const reference of references.rows) {
    await pool.query(
      `delete from ${quoteIdentifier(reference.table_schema)}.${quoteIdentifier(reference.table_name)}
       where ${quoteIdentifier(reference.column_name)} = any($1)`,
      [userIds]
    );
  }
}

async function deleteBetterAuthSmokeUsers(pool: TypedPgPool) {
  const users = await pool.query<{ id: string }>(
    `select id from ba_user where lower(email) like 'smoke\\_%@%' escape '\\'`,
    []
  );
  const userIds = users.rows.map((user) => user.id);
  if (userIds.length === 0) return;

  await deleteRowsReferencingBetterAuthUsers(pool, userIds);
  await pool.query(`delete from ba_user where id = any($1)`, [userIds]);
}

export async function cleanupSmokeFixtures(
  fixtures: SmokeFixtures,
  options: SmokeFixtureOptions & { pool?: TypedPgPool } = {}
) {
  const ownsPool = !options.pool;
  const pool = options.pool ?? createPgPool(requireDatabaseUrl());
  const emails = [
    fixtures.users.primary.email,
    fixtures.users.privacyAdmin.email,
    fixtures.users.privacySuperadmin.email,
    fixtures.inviteEmail,
    fixtures.emailChangeTo,
  ];

  try {
    await emit(options, `Cleaning smoke fixtures for run ${fixtures.runId}`);
    await pool.query(`delete from companies where id = $1`, [
      fixtures.companyId,
    ]);
    await pool.query(
      `delete from users where lower(email) = any($1) or id = any($2)`,
      [
        emails.map((email) => email.toLowerCase()),
        [
          fixtures.users.primary.id,
          fixtures.users.privacyAdmin.id,
          fixtures.users.privacySuperadmin.id,
        ].filter(Boolean),
      ]
    );
    try {
      await deleteBetterAuthUsersByEmail(pool, emails);
    } catch (error) {
      await emit(
        options,
        `BetterAuth smoke user cleanup was best-effort and did not complete: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  } finally {
    if (ownsPool) await pool.end();
  }
}

export async function sweepSmokeFixtures(
  options: SmokeFixtureOptions & { pool?: TypedPgPool } = {}
) {
  loadSmokeEnvFiles();
  const ownsPool = !options.pool;
  const pool = options.pool ?? createPgPool(requireDatabaseUrl());

  try {
    await emit(options, 'Sweeping stale smoke fixtures');
    await pool.query(`delete from companies where id like 'co_smoke_%'`);
    await pool.query(
      `delete from users where lower(email) like 'smoke\\_%@%' escape '\\'`
    );
    try {
      await deleteBetterAuthSmokeUsers(pool);
    } catch (error) {
      await emit(
        options,
        `BetterAuth stale smoke user sweep was best-effort and did not complete: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  } finally {
    if (ownsPool) await pool.end();
  }
}

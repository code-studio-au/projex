export type ServerLogLevel = 'info' | 'warn' | 'error';

type ServerLogCategory = 'operational' | 'audit';

type ServerLogFieldValue = string | number | boolean | null;

export type ServerLogFields = Readonly<
  Record<string, ServerLogFieldValue | undefined>
>;

type ServerLogEntry = {
  level: ServerLogLevel;
  type: string;
  category: ServerLogCategory;
  errorType?: string;
} & Record<string, ServerLogFieldValue | undefined>;

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_.]{2,79}$/u;
const MAX_FIELD_STRING_LENGTH = 512;
export const MAX_SERVER_LOG_BYTES = 8 * 1024;
const RESERVED_FIELD_NAMES = new Set([
  'level',
  'type',
  'category',
  'errorType',
]);
const APPROVED_FIELD_NAMES = new Set([
  'requestId',
  'jobId',
  'method',
  'path',
  'status',
  'durationMs',
  'code',
  'reason',
  'serverFnId',
  'serverFnName',
  'serverFnFile',
  'recoveredCount',
  'nodeEnv',
  'configKey',
  'protocol',
  'missingConfigCount',
  'actorUserId',
  'companyId',
  'projectId',
  'entityType',
  'entityId',
  'eventClass',
  'outcome',
  'reasonCode',
  'affectedCount',
]);
const APPROVED_AUDIT_FIELD_NAMES = new Set([
  'actorUserId',
  'companyId',
  'projectId',
  'entityType',
  'entityId',
  'eventClass',
  'outcome',
  'reasonCode',
  'affectedCount',
]);

const LOG_LEVEL_PRIORITY: Record<ServerLogLevel, number> = {
  info: 10,
  warn: 20,
  error: 30,
};

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

function runtimeEnv(name: string): string | undefined {
  const runtimeProcess = (globalThis as { process?: RuntimeProcess }).process;
  return runtimeProcess?.env?.[name];
}

function configuredLogLevel(): ServerLogLevel | 'off' {
  const configured = runtimeEnv('PROJEX_LOG_LEVEL')?.trim().toLowerCase();
  if (
    configured === 'off' ||
    configured === 'info' ||
    configured === 'warn' ||
    configured === 'error'
  ) {
    return configured;
  }
  return 'info';
}

export function isAuditLoggingEnabled(): boolean {
  return runtimeEnv('PROJEX_AUDIT_LOGGING')?.trim().toLowerCase() === 'true';
}

function normalizeEventName(event: string): string {
  return EVENT_NAME_PATTERN.test(event) ? event : 'invalid_server_log_event';
}

function classifyThrownValue(error: unknown): string {
  try {
    if (error instanceof TypeError) return 'TypeError';
    if (error instanceof RangeError) return 'RangeError';
    if (error instanceof SyntaxError) return 'SyntaxError';
    if (error instanceof AggregateError) return 'AggregateError';
    if (error instanceof Error) return 'Error';
  } catch {
    return 'UnknownThrownValue';
  }

  if (error === null) return 'NullThrownValue';
  if (typeof error === 'undefined') return 'UndefinedThrownValue';
  return 'NonErrorThrownValue';
}

function safeLogFields(
  fields: ServerLogFields | undefined,
  approvedFieldNames = APPROVED_FIELD_NAMES
): ServerLogFields {
  if (!fields) return {};

  const safe: Record<string, ServerLogFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      RESERVED_FIELD_NAMES.has(key) ||
      !approvedFieldNames.has(key) ||
      typeof value === 'undefined'
    ) {
      continue;
    }
    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    } else if (typeof value === 'string') {
      safe[key] = value.slice(0, MAX_FIELD_STRING_LENGTH);
    }
  }
  return safe;
}

function serializeLogEntry(entry: ServerLogEntry): string {
  const serialized = JSON.stringify(entry);
  if (new TextEncoder().encode(serialized).byteLength <= MAX_SERVER_LOG_BYTES) {
    return serialized;
  }
  return JSON.stringify({
    level: entry.level,
    type: 'server_log_entry_too_large',
    category: entry.category,
  });
}

function writeLogEntry(entry: ServerLogEntry): void {
  try {
    console[entry.level](serializeLogEntry(entry));
  } catch {
    // Logging is best effort and must not break application behavior.
  }
}

function shouldWriteOperationalLog(level: ServerLogLevel): boolean {
  const configured = configuredLogLevel();
  return (
    configured !== 'off' &&
    LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configured]
  );
}

/**
 * Writes one JSON server event containing only reviewed scalar context.
 *
 * Thrown values are deliberately classified without reading or serializing
 * their messages, stacks, causes, response bodies, headers, or custom fields.
 */
export function logServerEvent(args: {
  level: ServerLogLevel;
  event: string;
  error?: unknown;
  fields?: ServerLogFields;
}): void {
  if (!shouldWriteOperationalLog(args.level)) return;

  const entry: ServerLogEntry = {
    level: args.level,
    type: normalizeEventName(args.event),
    category: 'operational',
    ...safeLogFields(args.fields),
    ...('error' in args ? { errorType: classifyThrownValue(args.error) } : {}),
  };

  writeLogEntry(entry);
}

/**
 * Writes one sanitized audit-category event to the same structured server log
 * sink as operational events. Audit events are independently switchable and
 * are never persisted by this module.
 */
export function logAuditEvent(args: {
  event: string;
  fields?: ServerLogFields;
}): void {
  if (!isAuditLoggingEnabled()) return;

  writeLogEntry({
    level: 'info',
    type: normalizeEventName(args.event),
    category: 'audit',
    ...safeLogFields(args.fields, APPROVED_AUDIT_FIELD_NAMES),
  });
}

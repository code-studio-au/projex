export type ServerLogLevel = 'info' | 'warn' | 'error';

type ServerLogFieldValue = string | number | boolean | null;

export type ServerLogFields = Readonly<
  Record<string, ServerLogFieldValue | undefined>
>;

type ServerLogEntry = {
  level: ServerLogLevel;
  type: string;
  errorType?: string;
} & Record<string, ServerLogFieldValue | undefined>;

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
const RESERVED_FIELD_NAMES = new Set(['level', 'type', 'errorType']);
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
]);

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

function safeLogFields(fields: ServerLogFields | undefined): ServerLogFields {
  if (!fields) return {};

  const safe: Record<string, ServerLogFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      RESERVED_FIELD_NAMES.has(key) ||
      !APPROVED_FIELD_NAMES.has(key) ||
      typeof value === 'undefined'
    ) {
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    }
  }
  return safe;
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
  const entry: ServerLogEntry = {
    level: args.level,
    type: normalizeEventName(args.event),
    ...safeLogFields(args.fields),
    ...('error' in args ? { errorType: classifyThrownValue(args.error) } : {}),
  };

  console[args.level](JSON.stringify(entry));
}

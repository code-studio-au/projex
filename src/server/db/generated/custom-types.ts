import type { ColumnType } from 'kysely';

export type StringRecord = Record<string, string>;

export type NullableStringRecordJsonColumn = ColumnType<
  StringRecord | null,
  StringRecord | null,
  StringRecord | null
>;

export type StringRecordJsonColumn = ColumnType<
  StringRecord,
  StringRecord,
  StringRecord
>;

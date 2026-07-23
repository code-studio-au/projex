import type { ColumnType } from 'kysely';
import type { ImportPreviewRow } from '../../../types';

export type StringRecord = Record<string, string>;
export type JsonObject = Record<string, unknown>;

export type JsonObjectColumn = ColumnType<JsonObject, JsonObject, JsonObject>;

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

export type ImportPreviewRowJsonColumn = ColumnType<
  ImportPreviewRow | null,
  ImportPreviewRow | null,
  ImportPreviewRow | null
>;

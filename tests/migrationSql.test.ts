import assert from 'node:assert/strict';
import test from 'node:test';

import { splitSqlStatements } from '../src/server/db/migrate.ts';

test('splitSqlStatements keeps semicolons inside quoted strings', () => {
  const sql = `
    insert into notes(body) values ('alpha;beta');
    insert into notes(body) values ('gamma');
  `;

  assert.deepEqual(splitSqlStatements(sql), [
    "insert into notes(body) values ('alpha;beta')",
    "insert into notes(body) values ('gamma')",
  ]);
});

test('splitSqlStatements keeps semicolons inside dollar-quoted function bodies', () => {
  const sql = `
    create function demo() returns void as $$
    begin
      perform 1;
      perform 2;
    end;
    $$ language plpgsql;
    create table demo_table (id int);
  `;

  assert.deepEqual(splitSqlStatements(sql), [
    `create function demo() returns void as $$
    begin
      perform 1;
      perform 2;
    end;
    $$ language plpgsql`,
    'create table demo_table (id int)',
  ]);
});

test('splitSqlStatements ignores semicolons inside comments', () => {
  const sql = `
    -- comment with a semicolon;
    create table demo (id int); /* block; comment; */
    create index demo_idx on demo(id);
  `;

  assert.deepEqual(splitSqlStatements(sql), [
    `-- comment with a semicolon;
    create table demo (id int)`,
    '/* block; comment; */\n    create index demo_idx on demo(id)',
  ]);
});

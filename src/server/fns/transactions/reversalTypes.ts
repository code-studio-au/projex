import type { Kysely, Transaction } from 'kysely';

import type { DB } from '../../db/schema';

export type ReversalDbExecutor = Kysely<DB> | Transaction<DB>;

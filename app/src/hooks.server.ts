import type { Handle } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

// Symbol to track if foreign keys have been enabled for this request
const FOREIGN_KEYS_ENABLED = Symbol('foreignKeysEnabled');

/**
 * Enable foreign key constraints for SQLite/D1 database
 * This must be called per connection to ensure foreign key enforcement
 */
async function enableForeignKeys(db: D1Database): Promise<void> {
  await db.prepare('PRAGMA foreign_keys = ON').run();
}

export const handle: Handle = async ({ event, resolve }) => {
  // Enable foreign keys once per request when database is first accessed
  const db = event.platform?.env.ESCROWS_DB;
  if (db && !(event.locals as any)[FOREIGN_KEYS_ENABLED]) {
    await enableForeignKeys(db);
    (event.locals as any)[FOREIGN_KEYS_ENABLED] = true;
  }

  return resolve(event);
};

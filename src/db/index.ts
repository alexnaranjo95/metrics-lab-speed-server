import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

// Connection for queries
const queryClient = postgres(config.DATABASE_URL);

// Connection for migrations (max 1 connection)
const migrationClient = postgres(config.DATABASE_URL, { max: 1 });

export const db = drizzle(queryClient, { schema });

export async function runMigrations() {
  const migrationDb = drizzle(migrationClient);
  await migrate(migrationDb, { migrationsFolder: './drizzle' });
  console.log('Database migrations complete');
}

export { schema };

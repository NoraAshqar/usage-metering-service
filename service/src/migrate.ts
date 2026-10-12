import fs from 'fs';
import path from 'path';
import { pool, withTransaction } from './db';

// Folder with numbered .sql files: 001_schema.sql, 002_seed_plans.sql, ...
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Applies every .sql file that was not applied before, in name order.
// Each file runs in its own transaction: it is applied completely or not at all.
// To change the schema later, add a NEW file (e.g. 003_add_column.sql) - never edit an applied one.
export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rowCount) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`Applied migration ${file}`);
  }
}

// Applies db/migrations/*.sql in order, once each, to the Neon database.
// Usage: npm run db:migrate   (reads DATABASE_URL_UNPOOLED, or DATABASE_URL, from .env.local)
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Migrations need a direct (unpooled) connection when one is available.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL. Copy the connection string from the Neon console (or `vercel env pull .env.local`).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`);
  const { rows } = await client.query("select name from _migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(`db/migrations/${file}`, "utf8");
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into _migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`✓ applied ${file}`);
  }
  console.log("Database is up to date.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

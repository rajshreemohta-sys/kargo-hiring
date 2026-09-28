// Applies supabase/migrations/*.sql in order, once each.
// Usage: npm run db:migrate   (reads POSTGRES_URL_NON_POOLING from .env.local)
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("Missing POSTGRES_URL_NON_POOLING. Run `vercel env pull .env.local` first.");
  process.exit(1);
}

// Supabase uses its own CA; encrypt the connection but don't verify the chain.
const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())`);
  await client.query(`alter table public._migrations enable row level security`);
  await client.query(`revoke all on public._migrations from anon, authenticated`);

  const { rows } = await client.query("select name from public._migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(`supabase/migrations/${file}`, "utf8");
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1)", [file]);
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

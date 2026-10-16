import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const client = new Client({
  connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
});
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(200815)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const names = (
    await readdir(new URL("../prisma/migrations/", import.meta.url), {
      withFileTypes: true,
    })
  )
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  for (const name of names) {
    const sql = await readFile(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== checksum)
        throw new Error("Una migración aplicada fue modificada: " + name);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log("Migración aplicada: " + name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.end();
}

// Client generation uses the schema WASM shipped by Prisma. No native schema-engine
// is invoked for this command; migrations run separately through the pg driver.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve("prisma/package.json")),
  "build/index.js",
);
const wasm = join(dirname(cli), "schema_engine_bg.wasm");
const result = spawnSync(process.execPath, [cli, "generate"], {
  stdio: "inherit",
  env: { ...process.env, PRISMA_SCHEMA_ENGINE_BINARY: wasm },
});
process.exit(result.status ?? 1);

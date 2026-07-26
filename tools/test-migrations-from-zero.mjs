import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const disabledFile = path.join(root, "supabase", "disabled_migrations", "202607200001_task_workspace.sql");
const activeMigrations = fs.readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort();
const baselinePath = path.join(migrationsDir, "202607260001_remote_schema_baseline.sql");
const baseline = fs.readFileSync(baselinePath, "utf8");
const allMigrations = activeMigrations
  .map(name => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");
const policyCreates = (allMigrations.match(/^create policy /gim) || []).length;
const policyDrops = (allMigrations.match(/^drop policy if exists /gim) || []).length;
const staticInventory = {
  activeMigrations,
  disabledLegacyMigrationPresent: fs.existsSync(disabledFile),
  tableDefinitions: (baseline.match(/^create table /gm) || []).length,
  constraints: (baseline.match(/^alter table only /gm) || []).length,
  indexes: (baseline.match(/^CREATE (?:UNIQUE )?INDEX /gm) || []).length,
  functions: (allMigrations.match(/^create or replace function /gim) || []).length,
  triggers: (baseline.match(/^CREATE TRIGGER /gm) || []).length,
  policies: policyCreates - policyDrops,
  policyCreates,
  policyDrops,
  buckets: (baseline.match(/^insert into storage\.buckets /gm) || []).length,
};

const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
if (docker.status !== 0) {
  console.log(JSON.stringify({
    status: "NOT_VERIFIED",
    reason: "DOCKER_UNAVAILABLE",
    exitCode: 2,
    remoteApplied: false,
    staticInventory,
  }, null, 2));
  process.exit(2);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const baseArgs = ["--yes", "supabase@2.109.1"];
const executed = [];
const run = args => {
  const result = spawnSync(npx, [...baseArgs, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  executed.push({ command: `supabase ${args.join(" ")}`, exitCode: result.status ?? 1 });
  if (result.status !== 0) {
    throw new Error((result.error?.message || result.stderr || result.stdout || "Supabase command failed").trim());
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
};

let queryResult = null;
try {
  run(["start", "--workdir", root, "--exclude", "analytics,vector"]);
  run(["db", "reset", "--local", "--workdir", root, "--no-seed"]);
  const verificationSql = "select (select count(*) from pg_tables where schemaname='public'), (select count(*) from pg_policies where schemaname in ('public','storage')), (select count(*) from storage.buckets where id='lumina-datarooms');";
  const localQuery = spawnSync("docker", [
    "exec",
    "supabase_db_lumina-security-baseline",
    "psql",
    "-U", "postgres",
    "-d", "postgres",
    "-At",
    "-F", ",",
    "-c", verificationSql,
  ], { encoding: "utf8" });
  executed.push({ command: "docker exec supabase_db_lumina-security-baseline psql <local count query>", exitCode: localQuery.status ?? 1 });
  if (localQuery.status !== 0) {
    throw new Error((localQuery.error?.message || localQuery.stderr || localQuery.stdout || "Local verification query failed").trim());
  }
  const row = localQuery.stdout.trim().match(/^(\d+),(\d+),(\d+)$/);
  if (!row) throw new Error("Local verification query did not return three numeric values");
  queryResult = {
    tables: Number(row[1]),
    policies: Number(row[2]),
    buckets: Number(row[3]),
  };
  const expected = {
    tables: staticInventory.tableDefinitions,
    policies: staticInventory.policies,
    buckets: staticInventory.buckets,
  };
  if (Object.keys(expected).some(key => queryResult[key] !== expected[key])) {
    throw new Error(`Local schema counts differ: expected ${JSON.stringify(expected)}, got ${JSON.stringify(queryResult)}`);
  }
  console.log(JSON.stringify({
    status: "PASS",
    remoteApplied: false,
    staticInventory,
    actual: queryResult,
    executed,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    remoteApplied: false,
    staticInventory,
    actual: queryResult,
    executed,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
} finally {
  spawnSync(npx, [...baseArgs, "stop", "--workdir", root, "--no-backup"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

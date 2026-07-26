import { spawnSync } from "node:child_process";
import { requireTestEnvironment } from "../tests/security/test-env.mjs";

let env;
try {
  env = requireTestEnvironment({ requireWriteGuard: true });
} catch (error) {
  console.error(JSON.stringify(error.details || { status: "BLOCKED", reason: error.message }, null, 2));
  process.exit(2);
}

const mode = process.argv.includes("--push") ? "push" : process.argv.includes("--list") ? "list" : null;
if (!mode) {
  console.error(JSON.stringify({ status: "BLOCKED", reason: "USE_EXPLICIT_LIST_OR_PUSH_MODE" }, null, 2));
  process.exit(2);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const cli = ["--yes", "supabase@2.109.1"];
const args = mode === "list"
  ? ["migration", "list", "--db-url", env.dbUrl]
  : ["db", "push", "--db-url", env.dbUrl, "--yes"];
const result = spawnSync(executable, [...cli, ...args], {
  cwd: env.root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === "win32",
});

const sanitize = value => String(value || "")
  .split(env.dbUrl).join("<redacted-test-db-url>")
  .split(env.password).join("<redacted-test-password>");
const stdout = sanitize(result.stdout).trim();
const stderr = sanitize(result.stderr).trim();
if (stdout) process.stdout.write(`${stdout}\n`);
if (stderr) process.stderr.write(`${stderr}\n`);
console.log(JSON.stringify({
  status: result.status === 0 ? "PASS" : "FAIL",
  operation: mode === "list" ? "MIGRATION_LIST" : "DB_PUSH_EXPLICIT_TEST_URL",
  environment: "separate-test-project",
  projectRef: env.projectRef,
  linked: false,
  productionApplied: false,
  secretsPrinted: false,
  exitCode: result.status ?? 1,
}, null, 2));
process.exitCode = result.status ?? 1;

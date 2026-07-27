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
  tableDefinitions: (allMigrations.match(/^create table(?: if not exists)? /gim) || []).length,
  constraints: (baseline.match(/^alter table only /gm) || []).length,
  indexes: (baseline.match(/^CREATE (?:UNIQUE )?INDEX /gm) || []).length,
  functions: (allMigrations.match(/^create or replace function /gim) || []).length,
  triggers: (baseline.match(/^CREATE TRIGGER /gm) || []).length,
  policyNetOperations: policyCreates - policyDrops,
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
  const verificationSql = `
    select json_build_object(
      'tables', (select count(*) from pg_tables where schemaname='public'),
      'policies', (select count(*) from pg_policies where schemaname in ('public','storage')),
      'buckets', (select count(*) from storage.buckets where id='lumina-datarooms'),
      'profiles', array[
        private.cockpit_profile_for_project_role('CFO / Geschäftsführung'),
        private.cockpit_profile_for_project_role('Projektleitung Abschluss'),
        private.cockpit_profile_for_project_role('Leiter Rechnungswesen'),
        private.cockpit_profile_for_project_role('Bilanzbuchhaltung'),
        coalesce(private.cockpit_profile_for_project_role('Unbekannte Altrolle'), 'NULL')
      ],
      'substitution_table', to_regclass('public.project_member_substitutions') is not null,
      'task_deputy_absent', not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='tasks' and column_name='deputy_member_id'
      ),
      'legacy_deputy_preserved', (
        select count(*) = 2 from information_schema.columns
        where table_schema='public' and table_name='project_members' and column_name in ('deputy_name','deputy_email')
      ),
      'task_project_constraints', (
        select count(*) from pg_constraint
        where conname in (
          'documents_project_task_fkey','task_activity_events_project_task_fkey',
          'task_approvals_project_task_fkey','task_notifications_project_task_fkey',
          'task_review_notes_project_task_fkey'
        )
      ),
      'identity_helper_has_no_email', position('email' in lower(pg_get_functiondef('private.is_project_member(uuid)'::regprocedure))) = 0,
      'accepted_identity_enforced', position('invitation_status = ''accepted''' in pg_get_functiondef('private.is_project_member(uuid)'::regprocedure)) > 0
    );`;
  const verifyLocalSchema = label => {
    const localQuery = spawnSync("docker", [
      "exec", "supabase_db_lumina-security-baseline", "psql", "-U", "postgres", "-d", "postgres",
      "-At", "-c", verificationSql,
    ], { encoding: "utf8" });
    executed.push({ command: `docker exec supabase_db_lumina-security-baseline psql <${label} semantic verification>`, exitCode: localQuery.status ?? 1 });
    if (localQuery.status !== 0) throw new Error((localQuery.error?.message || localQuery.stderr || localQuery.stdout || "Local verification query failed").trim());
    const parsed = JSON.parse(localQuery.stdout.trim());
    const expectedProfiles = ["cfo", "project", "accounting_lead", "worker", "NULL"];
    if (parsed.tables !== staticInventory.tableDefinitions || parsed.buckets !== staticInventory.buckets) {
      throw new Error(`${label}: local schema counts differ: ${JSON.stringify(parsed)}`);
    }
    if (JSON.stringify(parsed.profiles) !== JSON.stringify(expectedProfiles)
      || !parsed.substitution_table || !parsed.task_deputy_absent || !parsed.legacy_deputy_preserved
      || parsed.task_project_constraints !== 5 || !parsed.identity_helper_has_no_email || !parsed.accepted_identity_enforced) {
      throw new Error(`${label}: Phase-2 semantic verification failed: ${JSON.stringify(parsed)}`);
    }
    return parsed;
  };

  run(["db", "reset", "--local", "--workdir", root, "--no-seed"]);
  queryResult = { firstApplication: verifyLocalSchema("first application") };
  run(["db", "reset", "--local", "--workdir", root, "--no-seed"]);
  queryResult.secondApplication = verifyLocalSchema("second application");
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

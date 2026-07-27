import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_TEST_REF, PERMISSION_FIELDS, createCleanupPlan, createProvisionPlan, normalizeEmail, shortId, validateProvisionEnvironment, validateTestUsersConfig } from "../assets/test-user-provisioning.mjs";

const root = path.resolve(import.meta.dirname, "..");
const defaultConfigPath = path.join(root, "config", "lumina-test-users.json");

function parseArgs(args) {
  const flags = new Set(args);
  const unknown = args.filter((arg) => !["--dry-run", "--apply", "--update-passwords", "--cleanup", "--delete-auth-users"].includes(arg));
  return { dryRun: !flags.has("--apply"), apply: flags.has("--apply"), updatePasswords: flags.has("--update-passwords"), cleanup: flags.has("--cleanup"), deleteAuthUsers: flags.has("--delete-auth-users"), unknown };
}

function accessLevel(identity) {
  if (identity.project_role === "CFO / Geschäftsführung") return "cfo";
  if (identity.project_role === "Projektleitung Abschluss") return "manager";
  if (identity.project_role === "Wirtschaftsprüfung") return "auditor";
  return "member";
}

function memberPayload(identity, projectId, userId, config) {
  const substitute = config.users.find((candidate) => candidate.membership_kind === "substitute" && normalizeEmail(candidate.principal_email) === normalizeEmail(identity.email));
  return {
    project_id: projectId, user_id: userId, name: identity.display_name, email: normalizeEmail(identity.email), project_role: identity.project_role,
    cockpit_profile: identity.cockpit_profile, deputy_name: substitute?.display_name ?? null, deputy_email: substitute ? normalizeEmail(substitute.email) : null,
    access_level: accessLevel(identity), invitation_status: "accepted",
    ...Object.fromEntries(PERMISSION_FIELDS.map((field) => [field, identity[field]]))
  };
}

async function listAllUsers(client) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("auth_user_list_failed");
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
  }
  return users;
}

async function readState(client, projectId) {
  const [{ data: project, error: projectError }, authUsers, { data: members, error: memberError }, { data: rawSubstitutions, error: substitutionError }] = await Promise.all([
    client.from("projects").select("id,name").eq("id", projectId).maybeSingle(), listAllUsers(client),
    client.from("project_members").select("id,project_id,user_id,name,email,project_role,cockpit_profile,invitation_status,can_read,can_upload,can_edit,can_approve,can_manage_members,can_view_all_tasks").eq("project_id", projectId),
    client.from("project_member_substitutions").select("id,project_id,principal_member_id,substitute_member_id,status").eq("project_id", projectId)
  ]);
  if (projectError || !project) throw new Error("target_project_not_found");
  if (memberError) throw new Error("member_read_failed");
  if (substitutionError) throw new Error("substitution_read_failed");
  const emailByMemberId = new Map((members ?? []).map((member) => [member.id, normalizeEmail(member.email)]));
  const substitutions = (rawSubstitutions ?? []).map((row) => ({ ...row, principal_email: emailByMemberId.get(row.principal_member_id) ?? "", substitute_email: emailByMemberId.get(row.substitute_member_id) ?? "" }));
  return { project, projectId, authUsers, members: members ?? [], substitutions };
}

function reportRows(rows) {
  return rows.map((row) => ({
    E_Mail: row.email, Art: row.membership_kind, Rolle: row.project_role, Profil: row.cockpit_profile,
    Auth: row.auth_status, Mitglied: row.member_status, User_ID: shortId(row.user_id), Einladung: row.invitation_status,
    Stellvertretung: row.substitution_status, Ergebnis: row.result, Fehler: row.error
  }));
}

async function executeProvision(client, config, env, plan, options) {
  const authByEmail = new Map((await listAllUsers(client)).map((user) => [normalizeEmail(user.email), user]));
  for (const action of plan.actions.filter(({ type }) => type === "create_auth_user")) {
    const { data, error } = await client.auth.admin.createUser({ email: action.email, password: env.LUMINA_TEST_PASSWORD, email_confirm: true, user_metadata: { display_name: action.identity.display_name, lumina_synthetic_test: true } });
    if (error || !data.user) throw new Error(`auth_create_failed:${action.email}`);
    authByEmail.set(action.email, data.user);
  }
  if (options.updatePasswords) {
    for (const action of plan.actions.filter(({ type }) => type === "update_password")) {
      const { error } = await client.auth.admin.updateUserById(action.userId, { password: env.LUMINA_TEST_PASSWORD });
      if (error) throw new Error(`password_update_failed:${action.email}`);
    }
  }
  for (const action of plan.actions.filter(({ type }) => ["create_member", "link_member"].includes(type))) {
    const authUser = authByEmail.get(action.email);
    if (!authUser) throw new Error(`missing_auth_after_create:${action.email}`);
    const payload = memberPayload(action.identity, env.LUMINA_TARGET_PROJECT_ID, authUser.id, config);
    const request = action.type === "create_member" ? client.from("project_members").insert(payload) : client.from("project_members").update(payload).eq("id", action.memberId);
    const { error } = await request;
    if (error) throw new Error(`member_write_failed:${action.email}`);
  }
  const { data: members, error: memberError } = await client.from("project_members").select("id,email,user_id").eq("project_id", env.LUMINA_TARGET_PROJECT_ID);
  if (memberError) throw new Error("member_readback_failed");
  const memberByEmail = new Map((members ?? []).map((member) => [normalizeEmail(member.email), member]));
  for (const action of plan.actions.filter(({ type }) => type === "create_substitution")) {
    const principal = memberByEmail.get(action.principalEmail), substitute = memberByEmail.get(action.substituteEmail);
    if (!principal || !substitute || principal.id === substitute.id) throw new Error(`substitution_identity_failed:${action.substituteEmail}`);
    const { error } = await client.from("project_member_substitutions").insert({ project_id: env.LUMINA_TARGET_PROJECT_ID, principal_member_id: principal.id, substitute_member_id: substitute.id, status: "active" });
    if (error) throw new Error(`substitution_create_failed:${action.substituteEmail}`);
  }
}

async function executeCleanup(client, plan) {
  for (const action of plan.actions.filter(({ type }) => type === "delete_substitution")) { const { error } = await client.from("project_member_substitutions").delete().eq("id", action.id); if (error) throw new Error("cleanup_substitution_failed"); }
  for (const action of plan.actions.filter(({ type }) => type === "delete_member")) { const { error } = await client.from("project_members").delete().eq("id", action.id); if (error) throw new Error(`cleanup_member_failed:${action.email}`); }
  for (const action of plan.actions.filter(({ type }) => type === "delete_auth_user")) { const { error } = await client.auth.admin.deleteUser(action.id); if (error) throw new Error(`cleanup_auth_failed:${action.email}`); }
}

async function defaultConfirm(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question}\n> `);prompt.close();return answer.trim() === question;
}

export async function runProvisioning({ args = [], env = process.env, clientFactory = createClient, confirm = defaultConfirm, output = console } = {}) {
  const options = parseArgs(args);
  if (options.unknown.length || (options.updatePasswords && (!options.apply || env.LUMINA_ALLOW_PASSWORD_UPDATE !== "true")) || (options.deleteAuthUsers && (!options.cleanup || !options.apply))) return { exitCode: 1, error: "invalid_options" };
  const environment = validateProvisionEnvironment(env);
  if (!environment.ok) { output.error(`ABBRUCH: ${environment.errors.join(", ")}`);return { exitCode: 1, error: "invalid_environment", details: environment.errors }; }
  const configPath = env.LUMINA_TEST_USERS_CONFIG ? path.resolve(env.LUMINA_TEST_USERS_CONFIG) : defaultConfigPath;
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const configValidation = validateTestUsersConfig(config);
  if (!configValidation.ok) { output.error(`ABBRUCH: ${configValidation.errors.join(", ")}`);return { exitCode: 1, error: "invalid_config" }; }
  output.log(`Project Ref: ${environment.projectRef}`);output.log(`Zielprojekt-ID: ${env.LUMINA_TARGET_PROJECT_ID}`);output.log(options.apply ? "Modus: APPLY" : "Modus: DRY RUN");
  const client = clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const before = await readState(client, env.LUMINA_TARGET_PROJECT_ID);
  const plan = options.cleanup ? createCleanupPlan(config, before, { deleteAuthUsers: options.deleteAuthUsers }) : createProvisionPlan(config, before, { updatePasswords: options.updatePasswords });
  if (!plan.ok) { output.error(`ABBRUCH: ${plan.conflicts.join(", ")}`);return { exitCode: 1, error: "conflict", plan }; }
  if (!options.cleanup) output.table(reportRows(plan.rows));
  output.log(`Geplante Aktionen: ${plan.actions.length}`);
  if (!options.apply) return { exitCode: 0, dryRun: true, plan, before };
  const required = options.cleanup ? `BESTÄTIGE CLEANUP ${ALLOWED_TEST_REF}` : `BESTÄTIGE PROVISIONIERUNG ${ALLOWED_TEST_REF}`;
  if (!(await confirm(required))) return { exitCode: 1, error: "confirmation_failed", plan };
  if (options.cleanup && options.deleteAuthUsers && !(await confirm(`BESTÄTIGE AUTH-LÖSCHUNG ${ALLOWED_TEST_REF}`))) return { exitCode: 1, error: "auth_delete_confirmation_failed", plan };
  if (options.cleanup) await executeCleanup(client, plan); else await executeProvision(client, config, env, plan, options);
  const after = await readState(client, env.LUMINA_TARGET_PROJECT_ID);
  const readback = options.cleanup ? createCleanupPlan(config, after, { deleteAuthUsers: options.deleteAuthUsers }) : createProvisionPlan(config, after, { updatePasswords: false });
  if (!options.cleanup && (!readback.ok || readback.actions.length)) throw new Error("provision_readback_not_idempotent");
  if (options.cleanup && readback.actions.length) throw new Error("cleanup_readback_incomplete");
  output.log("Read-back: PASS");return { exitCode: 0, applied: true, before, after, readback };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await runProvisioning({ args: process.argv.slice(2) });process.exitCode = result.exitCode; }
  catch (error) { console.error(`ABBRUCH: ${String(error.message ?? error).replace(/[\r\n]/g, " ")}`);process.exitCode = 1; }
}

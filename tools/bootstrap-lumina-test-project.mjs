import process from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const ALLOWED_PROJECT_REF = "vcozprjecsprgyeqfahn";
export const BLOCKED_PRODUCTION_REF = "mslbzypjtvvznyewupco";
export const OWNER_EMAIL = "projektleitung@volkerkusch.de";
export const COMPANY_NAME = "LUMINA Testgesellschaft 2026";
export const PROJECT_NAME = "LUMINA Jahresabschluss-Test 2026";
export const REQUIRED_ENV = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LUMINA_TEST_PASSWORD",
  "LUMINA_EXPECTED_PROJECT_REF"
]);

export const PROJECT_VALUES = Object.freeze({
  accounting_standard: "HGB",
  closing_scope: "single_group",
  number_of_entities: 1,
  special_scope: [],
  report_components: [],
  systems: {},
  risks: [],
  status: "draft"
});

const normalizeEmail = value => String(value ?? "").trim().toLowerCase();

export function describeServiceRoleKey(value, projectRef) {
  const key = String(value ?? "");
  if (key.startsWith("sb_secret_")) {
    return { keyType: "sb_secret" };
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const jwtRef = typeof payload.ref === "string" ? payload.ref : null;
      return { keyType: "legacy_jwt", jwtRef, jwtRefMatchesUrlRef: Boolean(jwtRef) && jwtRef === projectRef };
    } catch {
      // Ein nicht dekodierbarer Token wird ohne weitere Analyse als unbekannt behandelt.
    }
  }
  return { keyType: "unknown" };
}

function authListDiagnostic(error, projectRef, serviceRoleKey) {
  return {
    error: {
      name: error?.name ?? null,
      message: error?.message ?? null,
      status: error?.status ?? null,
      code: error?.code ?? null
    },
    projectRef,
    ...describeServiceRoleKey(serviceRoleKey, projectRef)
  };
}

export function projectRefFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) return null;
    return url.hostname.split(".")[0];
  } catch {
    return null;
  }
}

export function validateBootstrapEnvironment(env = {}) {
  const errors = REQUIRED_ENV.filter(name => !String(env[name] ?? "").trim()).map(name => `missing:${name}`);
  const projectRef = projectRefFromUrl(env.SUPABASE_URL);
  if (!projectRef) errors.push("invalid_supabase_url");
  if (projectRef === BLOCKED_PRODUCTION_REF) errors.push("production_ref_blocked");
  if (projectRef && projectRef !== ALLOWED_PROJECT_REF) errors.push("test_ref_not_allowed");
  if (env.LUMINA_EXPECTED_PROJECT_REF !== ALLOWED_PROJECT_REF) errors.push("expected_ref_not_allowed");
  if (projectRef && env.LUMINA_EXPECTED_PROJECT_REF !== projectRef) errors.push("expected_ref_mismatch");
  return { ok: errors.length === 0, errors: [...new Set(errors)], projectRef };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createBootstrapPlan(state = {}) {
  const authMatches = (state.authUsers ?? []).filter(user => normalizeEmail(user.email) === OWNER_EMAIL);
  const companyMatches = (state.companies ?? []).filter(company => company.name === COMPANY_NAME);
  const projectMatches = (state.projects ?? []).filter(project => project.name === PROJECT_NAME);
  const conflicts = [];
  if (authMatches.length > 1) conflicts.push("multiple_owner_auth_users");
  if (companyMatches.length > 1) conflicts.push("multiple_companies_with_target_name");
  if (projectMatches.length > 1) conflicts.push("multiple_projects_with_target_name");

  const owner = authMatches[0] ?? null;
  const company = companyMatches[0] ?? null;
  const project = projectMatches[0] ?? null;

  if (company && (!owner || company.created_by !== owner.id)) conflicts.push("company_owner_conflict");
  if (project) {
    if (!owner || !company || project.created_by !== owner.id || project.company_id !== company.id) conflicts.push("project_owner_or_company_conflict");
    for (const [field, expected] of Object.entries(PROJECT_VALUES)) {
      if (Array.isArray(expected) || (expected && typeof expected === "object")) {
        if (!sameJson(project[field], expected)) conflicts.push(`project_value_conflict:${field}`);
      } else if (project[field] !== expected) conflicts.push(`project_value_conflict:${field}`);
    }
  }

  const actions = [];
  if (!owner) actions.push({ type: "create_owner", email: OWNER_EMAIL });
  if (!company) actions.push({ type: "create_company", name: COMPANY_NAME });
  if (!project) actions.push({ type: "create_project", name: PROJECT_NAME });

  return {
    ok: conflicts.length === 0,
    conflicts: [...new Set(conflicts)],
    actions,
    owner,
    company,
    project,
    statuses: {
      owner: owner ? "reuse" : "create",
      company: company ? "reuse" : "create",
      project: project ? "reuse" : "create"
    }
  };
}

async function listAllUsers(client, context) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      const wrapped = new Error("auth_user_list_failed");
      wrapped.diagnostic = authListDiagnostic(error, context.projectRef, context.serviceRoleKey);
      throw wrapped;
    }
    const pageUsers = data.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return users;
}

async function readState(client, context) {
  const [authUsers, companyResult, projectResult] = await Promise.all([
    listAllUsers(client, context),
    client.from("companies").select("id,name,created_by").eq("name", COMPANY_NAME),
    client.from("projects").select("id,company_id,name,accounting_standard,closing_scope,number_of_entities,special_scope,report_components,systems,risks,status,created_by").eq("name", PROJECT_NAME)
  ]);
  if (companyResult.error) throw new Error("company_read_failed");
  if (projectResult.error) throw new Error("project_read_failed");
  return { authUsers, companies: companyResult.data ?? [], projects: projectResult.data ?? [] };
}

async function defaultConfirm(requiredText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${requiredText}\n> `);
  prompt.close();
  return answer.trim() === requiredText;
}

function parseArgs(args) {
  const allowed = new Set(["--dry-run", "--apply"]);
  const unknown = args.filter(arg => !allowed.has(arg));
  const apply = args.includes("--apply");
  return { apply, dryRun: !apply, unknown };
}

function report(result, output) {
  output.log(JSON.stringify({
    testInstance: result.projectRef,
    ownerStatus: result.plan.statuses.owner,
    companyStatus: result.plan.statuses.company,
    projectStatus: result.plan.statuses.project,
    projectId: result.projectId ?? null,
    actualWrites: result.actualWrites,
    conflicts: result.plan.conflicts
  }, null, 2));
}

export async function runBootstrap({
  args = [],
  env = process.env,
  clientFactory = createClient,
  confirm = defaultConfirm,
  output = console
} = {}) {
  const options = parseArgs(args);
  if (options.unknown.length || (args.includes("--dry-run") && args.includes("--apply"))) {
    return { exitCode: 1, error: "invalid_options", actualWrites: 0 };
  }
  const environment = validateBootstrapEnvironment(env);
  if (!environment.ok) {
    output.error(`ABBRUCH: ${environment.errors.join(", ")}`);
    return { exitCode: 1, error: "invalid_environment", details: environment.errors, actualWrites: 0 };
  }

  const client = clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  let before;
  try {
    before = await readState(client, { projectRef: environment.projectRef, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  } catch (error) {
    if (error?.message === "auth_user_list_failed" && error.diagnostic) {
      output.error(JSON.stringify(error.diagnostic, null, 2));
      return { exitCode: 1, error: "auth_user_list_failed", diagnostic: error.diagnostic, actualWrites: 0 };
    }
    throw error;
  }
  const plan = createBootstrapPlan(before);
  const baseResult = { projectRef: environment.projectRef, plan, actualWrites: 0, projectId: plan.project?.id ?? null };
  if (!plan.ok) {
    report(baseResult, output);
    return { ...baseResult, exitCode: 1, error: "conflict" };
  }
  if (!options.apply) {
    report(baseResult, output);
    return { ...baseResult, exitCode: 0, dryRun: true };
  }

  const requiredConfirmation = `BESTÄTIGE BOOTSTRAP ${ALLOWED_PROJECT_REF}`;
  if (!(await confirm(requiredConfirmation))) {
    return { ...baseResult, exitCode: 1, error: "confirmation_failed" };
  }

  let actualWrites = 0;
  let owner = plan.owner;
  let company = plan.company;
  if (!owner) {
    const { data, error } = await client.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: env.LUMINA_TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Test Projektleitung Hauptperson", lumina_synthetic_test: true }
    });
    if (error || !data.user) throw new Error("owner_create_failed");
    owner = data.user;
    actualWrites += 1;
  }
  if (!company) {
    const { data, error } = await client.from("companies").insert({ name: COMPANY_NAME, created_by: owner.id }).select("id,name,created_by").single();
    if (error || !data) throw new Error("company_create_failed");
    company = data;
    actualWrites += 1;
  }
  if (!plan.project) {
    const payload = { company_id: company.id, name: PROJECT_NAME, created_by: owner.id, ...PROJECT_VALUES };
    const { error } = await client.from("projects").insert(payload);
    if (error) throw new Error("project_create_failed");
    actualWrites += 1;
  }

  let after;
  try {
    after = await readState(client, { projectRef: environment.projectRef, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  } catch (error) {
    if (error?.message === "auth_user_list_failed" && error.diagnostic) {
      output.error(JSON.stringify(error.diagnostic, null, 2));
      return { exitCode: 1, error: "auth_user_list_failed", diagnostic: error.diagnostic, actualWrites };
    }
    throw error;
  }
  const readBackPlan = createBootstrapPlan(after);
  if (!readBackPlan.ok || readBackPlan.actions.length || !readBackPlan.project?.id) throw new Error("bootstrap_readback_failed");
  const result = { projectRef: environment.projectRef, plan: readBackPlan, actualWrites, projectId: readBackPlan.project.id, exitCode: 0, applied: true };
  report(result, output);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runBootstrap({ args: process.argv.slice(2) });
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`ABBRUCH: ${String(error.message ?? error).replace(/[\r\n]/g, " ")}`);
    process.exitCode = 1;
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKED_PRODUCTION_REF, COMPANY_NAME, OWNER_EMAIL, PROJECT_NAME, PROJECT_VALUES, createBootstrapPlan, describeServiceRoleKey, runBootstrap, validateBootstrapEnvironment } from "../tools/bootstrap-lumina-test-project.mjs";

const validEnv = {
  SUPABASE_URL: "https://vcozprjecsprgyeqfahn.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "mock-key",
  LUMINA_TEST_PASSWORD: "mock-password",
  LUMINA_EXPECTED_PROJECT_REF: "vcozprjecsprgyeqfahn"
};
const quiet = { log() {}, error() {} };

function mockClient(seed = {}) {
  const state = { authUsers: [], companies: [], projects: [], writes: 0, sequence: 0, ...structuredClone(seed) };
  const client = {
    state,
    auth: { admin: {
      async listUsers() { return { data: { users: state.authUsers }, error: null }; },
      async createUser(payload) {
        state.writes += 1;
        const user = { id: `owner-${++state.sequence}`, email: payload.email, user_metadata: payload.user_metadata, email_confirmed_at: payload.email_confirm ? "confirmed" : null };
        state.authUsers.push(user);
        return { data: { user }, error: null };
      }
    } },
    from(table) {
      let operation = "select", payload = null, filters = [];
      const rows = () => table === "companies" ? state.companies : state.projects;
      const matching = () => rows().filter(row => filters.every(([field, value]) => row[field] === value));
      const chain = {
        select() { return chain; },
        eq(field, value) { filters.push([field, value]); return chain; },
        insert(value) { operation = "insert"; payload = value; return chain; },
        single() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); }
      };
      function execute(single) {
        if (operation === "select") return Promise.resolve({ data: single ? matching()[0] ?? null : matching(), error: null });
        state.writes += 1;
        const row = { id: `${table}-${++state.sequence}`, ...payload };
        rows().push(row);
        return Promise.resolve({ data: single ? row : null, error: null });
      }
      return chain;
    }
  };
  return client;
}

test("Production Ref is blocked", () => {
  const result = validateBootstrapEnvironment({ ...validEnv, SUPABASE_URL: `https://${BLOCKED_PRODUCTION_REF}.supabase.co`, LUMINA_EXPECTED_PROJECT_REF: BLOCKED_PRODUCTION_REF });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("production_ref_blocked"));
});

test("wrong Expected Ref is blocked", () => {
  const result = validateBootstrapEnvironment({ ...validEnv, LUMINA_EXPECTED_PROJECT_REF: "other" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("expected_ref_mismatch"));
});

test("missing variables block before client creation", async () => {
  let created = false;
  const result = await runBootstrap({ env: { ...validEnv, LUMINA_TEST_PASSWORD: "" }, clientFactory: () => { created = true; }, output: quiet });
  assert.equal(result.exitCode, 1);
  assert.equal(created, false);
});

test("Dry Run writes nothing and plans exactly one owner", async () => {
  const client = mockClient();
  const result = await runBootstrap({ args: ["--dry-run"], env: validEnv, clientFactory: () => client, output: quiet });
  assert.equal(result.exitCode, 0);
  assert.equal(client.state.writes, 0);
  assert.deepEqual(result.plan.actions.map(action => action.type), ["create_owner", "create_company", "create_project"]);
  assert.equal(result.plan.actions.filter(action => action.type === "create_owner" && action.email === OWNER_EMAIL).length, 1);
});

test("Apply is idempotent", async () => {
  const client = mockClient();
  const first = await runBootstrap({ args: ["--apply"], env: validEnv, clientFactory: () => client, confirm: async () => true, output: quiet });
  assert.equal(first.exitCode, 0);
  assert.equal(first.actualWrites, 3);
  const second = await runBootstrap({ args: ["--apply"], env: validEnv, clientFactory: () => client, confirm: async () => true, output: quiet });
  assert.equal(second.exitCode, 0);
  assert.equal(second.actualWrites, 0);
  assert.equal(client.state.authUsers.length, 1);
  assert.equal(client.state.companies.length, 1);
  assert.equal(client.state.projects.length, 1);
});

test("conflicting records are never overwritten", () => {
  const owner = { id: "owner-1", email: OWNER_EMAIL };
  const company = { id: "company-1", name: COMPANY_NAME, created_by: "different-owner" };
  const project = { id: "project-1", name: PROJECT_NAME, company_id: company.id, created_by: owner.id, ...PROJECT_VALUES };
  const plan = createBootstrapPlan({ authUsers: [owner], companies: [company], projects: [project] });
  assert.equal(plan.ok, false);
  assert.ok(plan.conflicts.includes("company_owner_conflict"));
});

test("logs contain no password or service key", async () => {
  const messages = [];
  const output = { log: value => messages.push(String(value)), error: value => messages.push(String(value)) };
  await runBootstrap({ args: ["--dry-run"], env: validEnv, clientFactory: () => mockClient(), output });
  assert.doesNotMatch(messages.join(" "), /mock-password|mock-key/);
});

test("auth user list failure prints only safe key diagnostics", async () => {
  const payload = Buffer.from(JSON.stringify({ ref: "vcozprjecsprgyeqfahn", role: "service_role", hidden: "must-not-be-logged" })).toString("base64url");
  const legacyKey = `header.${payload}.signature`;
  const env = { ...validEnv, SUPABASE_SERVICE_ROLE_KEY: legacyKey, LUMINA_TEST_PASSWORD: "diagnostic-password" };
  const messages = [];
  const output = { log: value => messages.push(String(value)), error: value => messages.push(String(value)) };
  const client = mockClient();
  client.auth.admin.listUsers = async () => ({ data: null, error: { name: "AuthApiError", message: "User listing is not allowed", status: 403, code: "not_admin" } });
  const result = await runBootstrap({ args: ["--dry-run"], env, clientFactory: () => client, output });
  const rendered = messages.join(" ");
  assert.equal(result.exitCode, 1);
  assert.equal(result.actualWrites, 0);
  assert.match(rendered, /AuthApiError|User listing is not allowed|403|not_admin/);
  assert.match(rendered, /legacy_jwt|vcozprjecsprgyeqfahn|jwtRefMatchesUrlRef/);
  assert.doesNotMatch(rendered, /header\.|signature|must-not-be-logged|service_role|diagnostic-password/);
  assert.deepEqual(describeServiceRoleKey("sb_secret_example", "vcozprjecsprgyeqfahn"), { keyType: "sb_secret" });
  assert.deepEqual(describeServiceRoleKey("not-a-key", "vcozprjecsprgyeqfahn"), { keyType: "unknown" });
});

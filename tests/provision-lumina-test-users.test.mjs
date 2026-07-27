import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createCleanupPlan, createProvisionPlan, projectRefFromUrl, validateProvisionEnvironment, validateTestUsersConfig } from "../assets/test-user-provisioning.mjs";
import { runProvisioning } from "../tools/provision-lumina-test-users.mjs";

const config = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../config/lumina-test-users.json"), "utf8"));
const validEnv = { SUPABASE_URL: "https://vcozprjecsprgyeqfahn.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "mock-key", LUMINA_TEST_PASSWORD: "mock-password", LUMINA_EXPECTED_PROJECT_REF: "vcozprjecsprgyeqfahn", LUMINA_TARGET_PROJECT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const principals = config.users.filter(({ membership_kind }) => membership_kind === "principal");
const substitutes = config.users.filter(({ membership_kind }) => membership_kind === "substitute");
const quiet = { log() {}, error() {}, table() {} };

function mockClient(seed = {}) {
  const state = { projects: [{ id: validEnv.LUMINA_TARGET_PROJECT_ID, name: "LUMINA TEST" }], authUsers: [], members: [], substitutions: [], writes: 0, passwordUpdates: 0, ...structuredClone(seed) };
  let sequence = 0;
  const result = (data = null, error = null) => Promise.resolve({ data, error });
  const client = {
    state,
    auth: { admin: {
      async listUsers() { return { data: { users: state.authUsers }, error: null }; },
      async createUser(payload) { state.writes++;const user = { id: `user-${++sequence}`, email: payload.email, user_metadata: payload.user_metadata };state.authUsers.push(user);return { data: { user }, error: null }; },
      async updateUserById() { state.writes++;state.passwordUpdates++;return { data: {}, error: null }; },
      async deleteUser(id) { state.writes++;state.authUsers = state.authUsers.filter((user) => user.id !== id);return { data: {}, error: null }; }
    } },
    from(table) {
      let operation = "select", payload = null, filters = [];
      const rows = () => table === "projects" ? state.projects : table === "project_members" ? state.members : state.substitutions;
      const matching = () => rows().filter((row) => filters.every(([key, value]) => row[key] === value));
      const chain = {
        select() { return chain; }, eq(key, value) { filters.push([key, value]);return chain; },
        maybeSingle() { const data = matching()[0] ?? null;return result(data); },
        insert(value) { operation = "insert";payload = value;return chain; }, update(value) { operation = "update";payload = value;return chain; }, delete() { operation = "delete";return chain; },
        then(resolve, reject) {
          try {
            if (operation === "select") return result(matching()).then(resolve, reject);
            state.writes++;
            if (table === "project_members" && operation === "insert") state.members.push({ id: `member-${++sequence}`, ...payload });
            if (table === "project_member_substitutions" && operation === "insert") state.substitutions.push({ id: `sub-${++sequence}`, ...payload });
            if (operation === "update") Object.assign(matching()[0] ?? {}, payload);
            if (operation === "delete") {
              const ids = new Set(matching().map(({ id }) => id));
              if (table === "project_members") state.members = state.members.filter(({ id }) => !ids.has(id));
              if (table === "project_member_substitutions") state.substitutions = state.substitutions.filter(({ id }) => !ids.has(id));
            }
            return result(payload).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        }
      };return chain;
    }
  };
  return client;
}

test("1 configuration contains 30 entries", () => assert.equal(config.users.length, 30));
test("2 all emails are unique", () => assert.equal(new Set(config.users.map(({ email }) => email)).size, 30));
test("3 there are 15 principals", () => assert.equal(principals.length, 15));
test("4 there are 15 substitutes", () => assert.equal(substitutes.length, 15));
test("5 principals cover 15 business roles", () => assert.equal(new Set(principals.map(({ project_role }) => project_role)).size, 15));
test("6 exactly four cockpit profiles are used", () => assert.deepEqual([...new Set(config.users.map(({ cockpit_profile }) => cockpit_profile))].sort(), ["accounting_lead", "cfo", "project", "worker"]));
test("7 every substitute references a principal", () => assert.ok(substitutes.every(({ principal_email }) => principal_email)));
test("8 no substitution references itself", () => assert.ok(substitutes.every(({ email, principal_email }) => email !== principal_email)));
test("9 full config validation rejects duplicate addresses", () => { const copy = structuredClone(config);copy.users[1].email = copy.users[0].email;assert.equal(validateTestUsersConfig(copy).ok, false); });
test("10 worker cannot view all tasks", () => assert.ok(config.users.filter(({ cockpit_profile }) => cockpit_profile === "worker").every(({ can_view_all_tasks }) => !can_view_all_tasks)));
test("11 CFO has no automatic member management", () => assert.ok(config.users.filter(({ cockpit_profile }) => cockpit_profile === "cfo").every(({ can_manage_members }) => !can_manage_members)));
test("12 project substitute has no member management", () => assert.equal(config.users.find(({ email }) => email === "projektleitung2@volkerkusch.de").can_manage_members, false));
test("13 auditor has conservative permissions", () => assert.ok(config.users.filter(({ auditor_restricted }) => auditor_restricted).every((user) => !user.can_upload && !user.can_edit && !user.can_approve && !user.can_manage_members && !user.can_view_all_tasks)));
test("14 missing SUPABASE_URL aborts", () => assert.ok(validateProvisionEnvironment({ ...validEnv, SUPABASE_URL: "" }).errors.includes("missing:SUPABASE_URL")));
test("15 missing service role aborts", () => assert.ok(validateProvisionEnvironment({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: "" }).errors.includes("missing:SUPABASE_SERVICE_ROLE_KEY")));
test("16 missing password aborts", () => assert.ok(validateProvisionEnvironment({ ...validEnv, LUMINA_TEST_PASSWORD: "" }).errors.includes("missing:LUMINA_TEST_PASSWORD")));
test("17 production ref is blocked", () => assert.ok(validateProvisionEnvironment({ ...validEnv, SUPABASE_URL: "https://mslbzypjtvvznyewupco.supabase.co", LUMINA_EXPECTED_PROJECT_REF: "mslbzypjtvvznyewupco" }).errors.includes("production_ref_blocked")));
test("18 mismatching expected ref is blocked", () => assert.ok(validateProvisionEnvironment({ ...validEnv, LUMINA_EXPECTED_PROJECT_REF: "different" }).errors.includes("expected_ref_mismatch")));
test("19 dry run performs no writes", async () => { const client = mockClient();const result = await runProvisioning({ args: ["--dry-run"], env: validEnv, clientFactory: () => client, output: quiet });assert.equal(result.exitCode, 0);assert.equal(client.state.writes, 0); });
test("20 no --apply performs no writes", async () => { const client = mockClient();await runProvisioning({ args: [], env: validEnv, clientFactory: () => client, output: quiet });assert.equal(client.state.writes, 0); });
test("21 existing correct user and member are reused", () => { const identity = config.users[0], auth = { id: "u-1", email: identity.email }, member = { id: "m-1", user_id: auth.id, email: identity.email, project_role: identity.project_role, cockpit_profile: identity.cockpit_profile, invitation_status: "accepted", ...Object.fromEntries(["can_read","can_upload","can_edit","can_approve","can_manage_members","can_view_all_tasks"].map((key) => [key, identity[key]])) };const plan = createProvisionPlan(config, { authUsers: [auth], members: [member], substitutions: [] });assert.equal(plan.ok, true);assert.equal(plan.rows.find(({ email }) => email === identity.email).member_status, "correct");assert.equal(plan.actions.some((action) => action.email === identity.email && ["create_auth_user","create_member","link_member"].includes(action.type)), false); });
test("22 conflicting member user id is not overwritten", () => { const state = { authUsers: config.users.map((identity, i) => ({ id: `u-${i}`, email: identity.email })), members: [{ id: "m", email: config.users[0].email, user_id: "other", project_role: config.users[0].project_role }], substitutions: [] };assert.ok(createProvisionPlan(config, state).conflicts.some((value) => value.startsWith("member_user_conflict"))); });
test("23 passwords are not updated without switch", () => { const authUsers = config.users.map((identity, i) => ({ id: `u-${i}`, email: identity.email }));assert.equal(createProvisionPlan(config, { authUsers, members: [], substitutions: [] }).actions.some(({ type }) => type === "update_password"), false); });
test("24 password updates require both gates", async () => { const client = mockClient();const denied = await runProvisioning({ args: ["--apply", "--update-passwords"], env: validEnv, clientFactory: () => client, output: quiet });assert.equal(denied.exitCode, 1); });
test("25 project members are idempotently created", async () => { const client = mockClient();const env = { ...validEnv };const first = await runProvisioning({ args: ["--apply"], env, clientFactory: () => client, confirm: async () => true, output: quiet });assert.equal(first.exitCode, 0);const writes = client.state.writes;const second = await runProvisioning({ args: ["--apply"], env, clientFactory: () => client, confirm: async () => true, output: quiet });assert.equal(second.exitCode, 0);assert.equal(client.state.writes, writes); });
test("26 substitutions are idempotently created", async () => { const client = mockClient();await runProvisioning({ args: ["--apply"], env: validEnv, clientFactory: () => client, confirm: async () => true, output: quiet });assert.equal(client.state.substitutions.length, 15); });
test("27 cross-project substitution is excluded from plan", () => { const relation = { id: "s", status: "active", principal_email: principals[0].email, substitute_email: substitutes[0].email, project_id: "foreign" };const plan = createProvisionPlan(config, { projectId: validEnv.LUMINA_TARGET_PROJECT_ID, authUsers: [], members: [], substitutions: [relation] });assert.equal(plan.actions.filter(({ type }) => type === "create_substitution").length, 15);assert.equal(plan.rows.find(({ email }) => email === substitutes[0].email).substitution_status, "planned"); });
test("28 cleanup targets only configured synthetic identities", () => { const plan = createCleanupPlan(config, { authUsers: [{ id: "allowed", email: config.users[0].email, user_metadata: { lumina_synthetic_test: true } }, { id: "foreign", email: "foreign@example.test", user_metadata: { lumina_synthetic_test: true } }], members: [], substitutions: [] }, { deleteAuthUsers: true });assert.equal(plan.ok, true);assert.deepEqual(plan.actions.map(({ id }) => id), ["allowed"]);const protectedPlan=createCleanupPlan(config,{authUsers:[{id:"existing",email:config.users[0].email,user_metadata:{}}],members:[],substitutions:[]},{deleteAuthUsers:true});assert.equal(protectedPlan.ok,false);assert.ok(protectedPlan.conflicts[0].startsWith("auth_user_not_marked_synthetic")); });
test("29 logs never contain secret values", async () => { const messages = [];const output = { log: (value) => messages.push(String(value)), error: (value) => messages.push(String(value)), table: (value) => messages.push(JSON.stringify(value)) };await runProvisioning({ args: ["--dry-run"], env: validEnv, clientFactory: () => mockClient(), output });assert.doesNotMatch(messages.join(" "), /mock-password|mock-key/); });
test("30 second full run creates no duplicates", async () => { const client = mockClient();await runProvisioning({ args: ["--apply"], env: validEnv, clientFactory: () => client, confirm: async () => true, output: quiet });await runProvisioning({ args: ["--apply"], env: validEnv, clientFactory: () => client, confirm: async () => true, output: quiet });assert.equal(client.state.authUsers.length, 30);assert.equal(client.state.members.length, 30);assert.equal(client.state.substitutions.length, 15); });
test("project ref parser accepts only Supabase HTTPS URLs", () => { assert.equal(projectRefFromUrl(validEnv.SUPABASE_URL), "vcozprjecsprgyeqfahn");assert.equal(projectRefFromUrl("http://vcozprjecsprgyeqfahn.supabase.co"), null); });

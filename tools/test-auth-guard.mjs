import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as roles from "../assets/role-resolver.mjs";
import * as security from "../assets/cockpit-security.mjs";
import * as filters from "../assets/cockpit-filters.mjs";
import * as model from "../assets/cockpit-model.mjs";

const root = path.resolve(import.meta.dirname, "..");
const cockpit = fs.readFileSync(path.join(root, "cockpit.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const applicationScript = [...cockpit.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || "";

function createElement(id = "") {
  const classes = new Set();
  return {
    id, hidden: false, value: "", textContent: "", innerHTML: "", className: "", style: {}, dataset: {},
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), toggle: (name, force) => force === undefined ? (classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true)) : (force ? classes.add(name) : classes.delete(name), force), contains: name => classes.has(name) },
    addEventListener() {}, scrollIntoView() {}, querySelector() { return createElement(); }, querySelectorAll() { return []; }, insertAdjacentHTML() {},
  };
}

async function runScenario(session, pathname = "/cockpit", authOptions = {}) {
  const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const elements = new Map();
  const getElement = id => { if (!elements.has(id)) elements.set(id, createElement(id)); return elements.get(id); };
  const views = ["cockpit", "tasks", "rooms", "communication"].map(name => { const element = getElement(`view-${name}`); element.dataset.view = name; return element; });
  const nav = ["cockpit", "tasks", "rooms", "communication"].map(name => { const element = createElement(); element.dataset.view = name; return element; });
  ["loginEmail", "loginPassword", "newPassword", "confirmPassword"].forEach(getElement);
  getElement("protectedApp").hidden = true; getElement("authGate").hidden = true; getElement("recoveryGate").hidden = true; getElement("authLoading").hidden = false;
  const calls = [];
  const authPayloads = {};
  let authCallback = null;
  let activeSession = session;
  const defaultTableData = table => ({
    projects: activeSession ? [{ id: projectId, name: "Testabschluss", status: "active", closing_date: "2026-12-31", companies: { name: "Test GmbH" }, created_at: "2026-01-01" }] : [],
    project_members: activeSession ? [{ id: "member-cfo", project_id: projectId, user_id: activeSession.user.id, name: "Cora Finance", email: activeSession.user.email, project_role: "CFO / Geschäftsführung", cockpit_profile: "cfo", access_level: "cfo", can_read: true, can_upload: true, can_edit: true, can_approve: true, can_manage_members: true, can_view_all_tasks: true, invitation_status: "accepted" }] : [],
    tasks: [],
  })[table] || [];
  const tableData = table => authOptions.tableData?.[table] ?? defaultTableData(table);
  const client = {
    auth: {
      async getSession() { calls.push("getSession"); return { data: { session: activeSession }, error: authOptions.sessionError || null }; },
      onAuthStateChange(callback) { calls.push("onAuthStateChange"); authCallback = callback; if (authOptions.initialAuthEvent) callback(authOptions.initialAuthEvent, activeSession); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword(payload) { calls.push("auth:signInWithPassword"); authPayloads.passwordLogin = payload; if (authOptions.passwordError) return { data: { session: null }, error: authOptions.passwordError }; activeSession = authOptions.loginSession; return { data: { session: activeSession }, error: null }; },
      async resetPasswordForEmail(email, options) { calls.push("auth:resetPasswordForEmail"); authPayloads.passwordReset = { email, options }; return { data: {}, error: authOptions.resetError || null }; },
      async signInWithOtp(payload) { calls.push("auth:signInWithOtp"); authPayloads.magicLink = payload; return { error: authOptions.magicError || null }; },
      async updateUser(payload) { calls.push("auth:updateUser"); authPayloads.passwordUpdate = payload; return { data: { user: activeSession?.user || null }, error: authOptions.updateError || null }; },
      async signOut() { calls.push("auth:signOut"); activeSession = null; return { error: null }; },
    },
    from(table) {
      calls.push(`query:${table}`);
      const chain = { select: () => chain, order: () => chain, eq: () => chain, in: () => chain, then: resolve => Promise.resolve({ data: tableData(table), error: null }).then(resolve) };
      return chain;
    },
  };
  const local = new Map();
  const location = { pathname, origin: "http://127.0.0.1:4173", href: pathname, search: authOptions.search || "", hash: authOptions.hash || "" };
  const history = { replaceState(...args) { authPayloads.history = args; } };
  const windowObject = { open() {}, location, history, luminaCockpitReady: Promise.resolve({ roles, security, filters, model }) };
  const context = vm.createContext({
    supabase: { createClient: () => client }, location, window: windowObject,
    document: { getElementById: getElement, querySelectorAll: selector => selector === "[data-view]" ? nav : selector === ".view" ? views : [], querySelector: selector => selector.startsWith("#") ? getElement(selector.slice(1)) : null },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    console, Intl, Date, Map, Set, URL, URLSearchParams, encodeURIComponent, clearTimeout() {}, setTimeout() { return 0; },
  });
  vm.runInContext(applicationScript, context);
  await vm.runInContext("authReady", context);
  return { context, elements, calls, authPayloads, get authCallback() { return authCallback; } };
}

const checks = [
  ["Protected application is hidden in initial HTML", async () => {
    const protectedIndex = cockpit.indexOf('<div id="protectedApp" hidden>');
    assert.ok(protectedIndex >= 0 && cockpit.indexOf("<header>", protectedIndex) > protectedIndex && cockpit.indexOf("<main>", protectedIndex) > protectedIndex);
  }],
  ["Without session only login gate is visible and no project query runs", async () => {
    const result = await runScenario(null);
    assert.equal(result.elements.get("protectedApp").hidden, true);
    assert.equal(result.elements.get("authGate").hidden, false);
    assert.equal(result.elements.get("authLoading").hidden, true);
    assert.deepEqual(result.calls.filter(call => call.startsWith("query:")), []);
    assert.equal(result.calls[0], "getSession");
  }],
  ["Unresolved membership shows the neutral gate and loads no project data", async () => {
    const active = { user: { id: "user-unknown", email: "unknown@example.test" } };
    const result = await runScenario(active, "/cockpit", { tableData: { project_members: [{ id: "member-x", project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "user-unknown", email: "unknown@example.test", project_role: "Unbekannte Rolle", cockpit_profile: null, invitation_status: "accepted" }] } });
    assert.equal(result.elements.get("protectedApp").hidden, true);assert.equal(result.elements.get("membershipGate").hidden, false);
    assert.deepEqual(result.calls.filter(call => call.startsWith("query:")), ["query:project_members"]);
  }],
  ["Expired session returns to the protected login gate", async () => {
    const result = await runScenario(null, "/cockpit", { sessionError: new Error("refresh token expired") });
    assert.equal(result.elements.get("protectedApp").hidden, true);assert.equal(result.elements.get("authGate").hidden, false);
    assert.equal(result.elements.get("authGateNotice").textContent, "Die Sitzung konnte nicht geprüft werden.");
    assert.doesNotMatch(result.elements.get("authGateNotice").textContent, /refresh|token|expired/i);
  }],
  ["Valid session loads the membership-derived CFO start", async () => {
    const result = await runScenario({ user: { id: "user-cfo", email: "cfo@example.test" } });
    assert.equal(result.elements.get("protectedApp").hidden, false);
    assert.equal(result.elements.get("authGate").hidden, true);
    assert.equal(result.elements.get("roleIdentityLabel").textContent, "CFO / Geschäftsführung");
    assert.deepEqual(result.calls.slice(0, 5), ["getSession", "onAuthStateChange", "query:project_members", "query:projects", "query:tasks"]);
  }],
  ["Successful password login starts the membership-derived cockpit", async () => {
    const loginSession = { user: { id: "user-cfo", email: "cfo@example.test" } };
    const result = await runScenario(null, "/cockpit", { loginSession });
    result.elements.get("loginEmail").value = "cfo@example.test";
    result.elements.get("loginPassword").value = "correct-" + "input";
    await vm.runInContext("passwordLogin()", result.context);
    assert.equal(result.authPayloads.passwordLogin.email, "cfo@example.test");assert.equal(result.authPayloads.passwordLogin.password, "correct-input");
    assert.equal(result.elements.get("protectedApp").hidden, false);
    assert.equal(result.elements.get("roleIdentityLabel").textContent, "CFO / Geschäftsführung");
    assert.equal(result.elements.get("loginPassword").value, "");
  }],
  ["Wrong password uses the neutral login error", async () => {
    const result = await runScenario(null, "/cockpit", { passwordError: new Error("invalid credentials") });
    result.elements.get("loginEmail").value = "known@example.test";result.elements.get("loginPassword").value = "wrong-input";
    await vm.runInContext("passwordLogin()", result.context);
    assert.equal(result.elements.get("authGateNotice").textContent, "E-Mail-Adresse oder Passwort ist nicht korrekt.");
    assert.doesNotMatch(result.elements.get("authGateNotice").textContent, /invalid|credentials|known@example/i);
  }],
  ["Unknown email uses the identical neutral login error", async () => {
    const result = await runScenario(null, "/cockpit", { passwordError: new Error("user not found") });
    result.elements.get("loginEmail").value = "unknown@example.test";result.elements.get("loginPassword").value = "any-input";
    await vm.runInContext("passwordLogin()", result.context);
    assert.equal(result.elements.get("authGateNotice").textContent, "E-Mail-Adresse oder Passwort ist nicht korrekt.");
    assert.doesNotMatch(result.elements.get("authGateNotice").textContent, /unknown|not found/i);
  }],
  ["Password reset uses the fixed recovery redirect and neutral response", async () => {
    const result = await runScenario(null);
    result.elements.get("loginEmail").value = "person@example.test";
    await vm.runInContext("requestPasswordReset()", result.context);
    assert.equal(result.authPayloads.passwordReset.email, "person@example.test");assert.equal(result.authPayloads.passwordReset.options.redirectTo, "http://127.0.0.1:4173/cockpit");
    assert.match(result.elements.get("authGateNotice").textContent, /Wenn für diese E-Mail-Adresse ein Zugang besteht/);
  }],
  ["Magic link remains available", async () => {
    const result = await runScenario(null);
    result.elements.get("loginEmail").value = "person@example.test";
    await vm.runInContext("sendMagicLink()", result.context);
    assert.equal(result.authPayloads.magicLink.email, "person@example.test");assert.equal(result.authPayloads.magicLink.options.emailRedirectTo, "http://127.0.0.1:4173/cockpit");
    assert.equal(result.elements.get("authGateNotice").textContent, "Anmeldelink wurde versendet.");
  }],
  ["Password update is shown and accepted only with a valid recovery session", async () => {
    const recoverySession = { user: { id: "user-cfo", email: "cfo@example.test" } };
    const result = await runScenario(recoverySession, "/cockpit", { initialAuthEvent: "PASSWORD_RECOVERY" });
    assert.equal(result.elements.get("recoveryGate").hidden, false);assert.equal(result.elements.get("protectedApp").hidden, true);
    result.elements.get("newPassword").value = "new-" + "secure-input";result.elements.get("confirmPassword").value = "new-" + "secure-input";
    await vm.runInContext("updateRecoveredPassword()", result.context);
    assert.equal(result.authPayloads.passwordUpdate.password, "new-secure-input");
    assert.equal(result.elements.get("protectedApp").hidden, false);
    assert.ok(result.authPayloads.history);
  }],
  ["Recovery URL without a valid session never shows password update", async () => {
    const result = await runScenario(null, "/cockpit", { search: "?type=recovery" });
    assert.equal(result.elements.get("recoveryGate").hidden, true);assert.equal(result.elements.get("authGate").hidden, false);
  }],
  ["Forged recovery query with a normal session never shows password update", async () => {
    const normalSession = { user: { id: "user-cfo", email: "cfo@example.test" } };
    const result = await runScenario(normalSession, "/cockpit", { search: "?type=recovery" });
    assert.equal(result.elements.get("recoveryGate").hidden, true);assert.equal(result.elements.get("protectedApp").hidden, false);
  }],
  ["SIGNED_OUT immediately removes protected UI", async () => {
    const result = await runScenario({ user: { id: "user-cfo", email: "cfo@example.test" } });
    result.authCallback("SIGNED_OUT", null);
    assert.equal(result.elements.get("protectedApp").hidden, true);
    assert.equal(result.elements.get("authGate").hidden, false);
    assert.equal(vm.runInContext("user", result.context), null);
  }],
  ["Protected direct paths resolve to guarded cockpit views", async () => {
    const result = await runScenario(null, "/aufgaben");
    assert.equal(vm.runInContext('protectedViewForPath("/aufgaben")', result.context), "tasks");
    assert.equal(vm.runInContext('protectedViewForPath("/datenraeume")', result.context), "rooms");
    assert.equal(vm.runInContext('protectedViewForPath("/kommunikation")', result.context), "communication");
    assert.deepEqual(vercel.rewrites, [
      { source: "/aufgaben", destination: "/cockpit" },
      { source: "/datenraeume", destination: "/cockpit" },
      { source: "/kommunikation", destination: "/cockpit" },
    ]);
  }],
];

const results = [];
for (const [name, check] of checks) {
  try { await check(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message }); }
}
console.log(JSON.stringify({ command: "node tools/test-auth-guard.mjs", checks: results.length, passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length, results }, null, 2));
if (results.some(result => result.status === "FAIL")) process.exitCode = 1;

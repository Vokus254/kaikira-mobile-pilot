import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const cockpit = fs.readFileSync(path.join(root, "cockpit.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const applicationScript = [...cockpit.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].at(-1)?.[1] || "";

function createElement(id = "") {
  const classes = new Set();
  return {
    id, hidden: false, value: "", textContent: "", innerHTML: "", className: "", style: {}, dataset: {},
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), toggle: (name, force) => force === undefined ? (classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true)) : (force ? classes.add(name) : classes.delete(name), force), contains: name => classes.has(name) },
    addEventListener() {}, scrollIntoView() {},
  };
}

async function runScenario(session, pathname = "/cockpit") {
  const elements = new Map();
  const getElement = id => { if (!elements.has(id)) elements.set(id, createElement(id)); return elements.get(id); };
  const views = ["cockpit", "tasks", "rooms", "communication"].map(name => { const element = getElement(`view-${name}`); element.dataset.view = name; return element; });
  const nav = ["cockpit", "tasks", "rooms", "communication"].map(name => { const element = createElement(); element.dataset.view = name; return element; });
  getElement("protectedApp").hidden = true; getElement("authGate").hidden = true; getElement("authLoading").hidden = false;
  const calls = [];
  let authCallback = null;
  const tableData = {
    projects: session ? [{ id: "project-a", name: "Testabschluss", status: "active", closing_date: "2026-12-31", companies: { name: "Test GmbH" }, created_at: "2026-01-01" }] : [],
    project_members: session ? [{ id: "member-cfo", project_id: "project-a", user_id: session.user.id, name: "Cora Finance", email: session.user.email, project_role: "CFO / Geschäftsführung", access_level: "cfo", can_read: true, can_upload: true, can_edit: true, can_approve: true, can_manage_members: true, invitation_status: "accepted" }] : [],
    tasks: [],
  };
  const client = {
    auth: {
      async getSession() { calls.push("getSession"); return { data: { session }, error: null }; },
      onAuthStateChange(callback) { calls.push("onAuthStateChange"); authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithOtp() { return { error: null }; }, async signOut() { return { error: null }; },
    },
    from(table) {
      calls.push(`query:${table}`);
      const chain = { select: () => chain, order: () => chain, eq: () => chain, in: () => chain, then: resolve => Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve) };
      return chain;
    },
  };
  const local = new Map();
  const location = { pathname, origin: "http://127.0.0.1:4173", href: pathname };
  const context = vm.createContext({
    supabase: { createClient: () => client }, location, window: { open() {}, location },
    document: { getElementById: getElement, querySelectorAll: selector => selector === "[data-view]" ? nav : selector === ".view" ? views : [], querySelector: selector => selector.startsWith("#") ? getElement(selector.slice(1)) : null },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    console, Intl, Date, Map, Set, URL, encodeURIComponent, clearTimeout() {}, setTimeout() { return 0; },
  });
  vm.runInContext(applicationScript, context);
  await vm.runInContext("authReady", context);
  return { context, elements, calls, get authCallback() { return authCallback; } };
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
  ["Valid session loads the membership-derived CFO start", async () => {
    const result = await runScenario({ user: { id: "user-cfo", email: "cfo@example.test" } });
    assert.equal(result.elements.get("protectedApp").hidden, false);
    assert.equal(result.elements.get("authGate").hidden, true);
    assert.equal(result.elements.get("roleIdentityLabel").textContent, "CFO / Geschäftsführung");
    assert.deepEqual(result.calls.slice(0, 4), ["getSession", "query:projects", "query:project_members", "query:tasks"]);
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

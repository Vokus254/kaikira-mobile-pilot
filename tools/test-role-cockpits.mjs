import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cockpit = fs.readFileSync(path.join(root, "cockpit.html"), "utf8");
const inlineScripts = [...cockpit.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
const applicationScript = inlineScripts.at(-1)?.[1] || "";

const checks = [
  ["Cockpit script is syntactically valid", () => new Function(applicationScript)],
  ["Membership is loaded from project_members", () => assert.match(applicationScript, /from\("project_members"\)/)],
  ["Membership query includes role and permission fields", () => assert.match(applicationScript, /project_role.*access_level.*can_read.*can_upload.*can_edit.*can_approve.*can_manage_members/)],
  ["Identity binding prioritizes auth user_id", () => assert.match(applicationScript, /member\.user_id&&member\.user_id===user\?\.id/)],
  ["CFO profile exists", () => assert.match(applicationScript, /key:"cfo"/)],
  ["Accounting lead profile exists", () => assert.match(applicationScript, /key:"accounting_lead"/)],
  ["Worker profile exists", () => assert.match(applicationScript, /key:"worker"/)],
  ["Unknown roles do not inherit a privileged profile", () => assert.match(applicationScript, /key:"unsupported"/)],
  ["No manual role-switch controls remain", () => assert.doesNotMatch(cockpit, /data-role-view|setManagementRole|managementRole/)],
  ["Planner and admin navigation are hidden until authorized", () => {
    assert.match(cockpit, /id="plannerNav"[^>]*hidden/);
    assert.match(cockpit, /id="adminNav"[^>]*hidden/);
    assert.match(cockpit, /id="openAdmin"[^>]*hidden/);
  }],
  ["All three role renderers are selected from the derived profile", () => {
    assert.match(applicationScript, /currentRoleProfile\.key==="cfo"\)renderCfoCockpit/);
    assert.match(applicationScript, /currentRoleProfile\.key==="accounting_lead"\)renderAccountingLeadCockpit/);
    assert.match(applicationScript, /currentRoleProfile\.key==="worker"\)renderWorkerCockpit/);
  }],
];

const results = [];
for (const [name, check] of checks) {
  try {
    check();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
  }
}

console.log(JSON.stringify({ command: "node tools/test-role-cockpits.mjs", checks: results.length, passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length, results }, null, 2));
if (results.some(result => result.status === "FAIL")) process.exitCode = 1;

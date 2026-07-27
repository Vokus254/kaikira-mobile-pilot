import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyMemberContext, supportedProjectRoles } from "../assets/role-resolver.mjs";
import { acceptedProjectContexts, isActiveSubstitution, navigationFor, validatedProjectChoice } from "../assets/cockpit-security.mjs";
import { COCKPIT_FILTERS, normalizeCockpitFilter, taskMatchesFilter } from "../assets/cockpit-filters.mjs";
import { buildCockpitModel, prioritizeWorkerTasks } from "../assets/cockpit-model.mjs";

const root = path.resolve(import.meta.dirname, "..");
const cockpit = fs.readFileSync(path.join(root, "cockpit.html"), "utf8");
const script = [...cockpit.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].at(-1)?.[1] ?? "";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "role@example.test" };
const member = (role, profile, overrides = {}) => ({ id: "member-1", project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: user.id, email: user.email, project_role: role, cockpit_profile: profile, invitation_status: "accepted", ...overrides });
const resolve = (role, profile, overrides) => classifyMemberContext([member(role, profile, overrides)], user);
const workerRoles = supportedProjectRoles.filter(({ cockpitProfile }) => cockpitProfile === "worker");
const checks = [
  ["1 CFO erhält CFO-Cockpit", () => assert.equal(resolve("CFO / Geschäftsführung", "cfo").cockpitProfile, "cfo")],
  ["2 Projektleitung erhält Projekt-Cockpit", () => assert.equal(resolve("Projektleitung Abschluss", "project").cockpitProfile, "project")],
  ["3 Leiter Rechnungswesen erhält Team-Cockpit", () => assert.equal(resolve("Leiter Rechnungswesen", "accounting_lead").cockpitProfile, "accounting_lead")],
  ["4 jede Worker-Rolle erhält Mein Tag", () => assert.equal(workerRoles.length, 12)],
  ["5 alle 15 fachlichen Rollen sind abgedeckt", () => assert.equal(supportedProjectRoles.length, 15)],
  ["6 fachliche Rollenbezeichnung wird angezeigt", () => assert.match(script, /Mein Tag – \$\{currentMembership\.project_role\}/)],
  ["7 unbekannte Rolle erhält Sicherheitsansicht", () => assert.equal(resolve("Unbekannt", null).status, "unsupported_role")],
  ["8 pending erhält Sicherheitsansicht", () => assert.equal(resolve("Bilanzbuchhaltung", "worker", { invitation_status: "pending" }).status, "inactive")],
  ["9 invited erhält Sicherheitsansicht", () => assert.equal(resolve("Bilanzbuchhaltung", "worker", { invitation_status: "invited" }).status, "inactive")],
  ["10 declined erhält Sicherheitsansicht", () => assert.equal(resolve("Bilanzbuchhaltung", "worker", { invitation_status: "declined" }).status, "inactive")],
  ["11 inactive erhält Sicherheitsansicht", () => assert.equal(resolve("Bilanzbuchhaltung", "worker", { invitation_status: "inactive" }).status, "inactive")],
  ["12 fehlende user_id erhält Sicherheitsansicht", () => assert.equal(resolve("Bilanzbuchhaltung", "worker", { user_id: null }).status, "inactive")],
  ["13 mehrdeutige Mitgliedschaft erhält Sicherheitsansicht", () => assert.equal(classifyMemberContext([member("Bilanzbuchhaltung", "worker"), member("Bilanzbuchhaltung", "worker", { id: "member-2" })], user).status, "ambiguous")],
  ["14 Sicherheitsansicht sperrt geschützte App", () => assert.match(script, /showMembershipGate[\s\S]*protectedApp"\)\.hidden=true/)],
  ["15 Worker sieht keine Adminnavigation", () => assert.equal(navigationFor({ cockpitProfile: "worker", member: { can_manage_members: false } }).admin, false)],
  ["16 CFO ohne can_manage_members sieht keine Mitgliederverwaltung", () => assert.equal(navigationFor({ cockpitProfile: "cfo", member: { can_manage_members: false } }).admin, false)],
  ["17 Projektleitung ohne can_manage_members sieht keine Mitgliederverwaltung", () => assert.equal(navigationFor({ cockpitProfile: "project", member: { can_manage_members: false } }).admin, false)],
  ["18 explizit berechtigter Benutzer sieht Mitgliederverwaltung", () => assert.equal(navigationFor({ cockpitProfile: "project", member: { can_manage_members: true } }).admin, true)],
  ["19 Leiter Rechnungswesen erhält keine globale Administration", () => assert.equal(navigationFor({ cockpitProfile: "accounting_lead", member: { can_manage_members: false } }).admin, false)],
  ["20 Stellvertretungsaufgaben werden gekennzeichnet", () => assert.match(script, /Vertretung für/)],
  ["21 abgelaufene Stellvertretung wird nicht angezeigt", () => assert.equal(isActiveSubstitution({ status: "active", ends_on: "2026-01-01" }, "2026-07-27"), false)],
  ["22 fremde Projektvertretung wird nicht angezeigt", () => assert.match(script, /row\.project_id===currentProject\.id&&row\.substitute_member_id===currentMembership\.id/)],
  ["23 KPI-Klick setzt korrekten Filter", () => assert.equal(taskMatchesFilter({ status: "blocked" }, "blocked"), true)],
  ["24 Filter kann zurückgesetzt werden", () => assert.match(script, /params\.delete\("filter"\)/)],
  ["25 URL-Filter werden validiert", () => { assert.equal(normalizeCockpitFilter("<sql>"), "all"); assert.ok(COCKPIT_FILTERS.overdue); }],
  ["26 keine fest codierten Demozahlen im produktiven Cockpit", () => assert.doesNotMatch(cockpit, />62\s*%|>57\s*Tage|>3\s*Entscheidungen|>2\s*Engpässe/)],
  ["27 keine duplizierte Rollenauflösung", () => { assert.doesNotMatch(script, /deriveRoleProfile|membershipPriority/); assert.match(cockpit, /role-resolver\.mjs/); }],
  ["28 Logout auf allen Profilen erreichbar", () => { assert.match(cockpit, /id="logoutBtn"/); assert.match(cockpit, /id="membershipLogoutBtn"/); }],
  ["29 Projektwechsel nur zu accepted-Projekten", () => assert.equal(validatedProjectChoice({ requested: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contexts: [{ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], projects: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] }), null)],
  ["30 Wirtschaftsprüfung sieht keine Managementbereiche", () => assert.equal(navigationFor({ cockpitProfile: "worker", member: { project_role: "Wirtschaftsprüfung" } }).internalManagement, false)],
  ["31 keine Projektabfragen vor Rollenauflösung", () => assert.ok(script.indexOf('from("project_members")') < script.indexOf('from("projects")'))],
  ["32 Logo- und Rücknavigation funktionieren", () => { assert.match(cockpit, /class="brand" href="\/"/); assert.match(cockpit, /Zur LUMINA Landingpage/); }],
  ["Echte Kennzahlen werden aus Aufgaben berechnet", () => { const model = buildCockpitModel({ tasks: [{ id: "1", status: "completed" }, { id: "2", status: "blocked", due_date: "2026-01-01" }], today: "2026-07-27" }); assert.equal(model.actualProgress, 50); assert.equal(model.critical.length, 1); }],
  ["Mehrprojektauflösung gruppiert je Projekt", () => assert.equal(acceptedProjectContexts([member("Bilanzbuchhaltung", "worker")], user, classifyMemberContext).contexts.length, 1)],
  ["Budget bleibt ohne Schemaquelle unkonfiguriert", () => assert.equal(buildCockpitModel({}).budget, null)],
  ["Worker-Priorität setzt blockierend und überfällig zuerst", () => assert.equal(prioritizeWorkerTasks([{ id: "regular", status: "in_progress", due_date: "2026-07-28" }, { id: "blocked", status: "blocked", due_date: "2026-07-01" }], "2026-07-27")[0].id, "blocked")],
];

const results = [];
for (const [name, check] of checks) {
  try { await check(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message }); }
}
console.log(JSON.stringify({ command: "node tools/test-role-cockpits.mjs", checks: results.length, passed: results.filter(({ status }) => status === "PASS").length, failed: results.filter(({ status }) => status === "FAIL").length, results }, null, 2));
if (results.some(({ status }) => status === "FAIL")) process.exitCode = 1;

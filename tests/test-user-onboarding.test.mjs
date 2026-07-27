import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { applyRoleIdentityPairs, buildOnboardingPreview, buildRoleIdentityPairs, roleDefaultsFor, validatePlannerTeam } from "../assets/test-user-onboarding.mjs";

const config = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../config/lumina-test-users.json"), "utf8"));
const legacyTeam = config.users.filter(({ membership_kind }) => membership_kind === "principal").map((identity, index) => ({
  role: identity.project_role,
  name: `Alt ${index + 1}`,
  email: `sammel-${index + 1}@example.invalid`,
  deputy: `Alt Stellvertretung ${index + 1}`,
  deputyEmail: `sammel-stv-${index + 1}@example.invalid`
}));

test("builds one principal/substitute pair for every role", () => {
  const result = buildRoleIdentityPairs(config);
  assert.equal(result.ok, true);
  assert.equal(result.pairs.length, 15);
  assert.ok(result.pairs.every(({ principal, substitute }) => principal.project_role === substitute.project_role));
});

test("role defaults centrally prefill profile and separate permissions", () => {
  const result = roleDefaultsFor(config, "Projektleitung Abschluss");
  assert.equal(result.defaults.principal.cockpit_profile, "project");
  assert.equal(result.defaults.principal.can_manage_members, true);
  assert.equal(result.defaults.substitute.can_manage_members, false);
});

test("preview preserves and exposes every old address before mapping", () => {
  const result = buildOnboardingPreview(legacyTeam, config);
  assert.equal(result.rows.length, 30);
  assert.equal(result.rows[0].old_email, "sammel-1@example.invalid");
  assert.equal(result.rows[1].old_email, "sammel-stv-1@example.invalid");
});

test("mapping produces 15 principal rows and separate substitute data", () => {
  const result = applyRoleIdentityPairs(legacyTeam, config);
  assert.equal(result.team.length, 15);
  assert.equal(result.team[0].membershipKind, "principal");
  assert.equal(result.team[0].email, "cfo@volkerkusch.de");
  assert.equal(result.team[0].deputyEmail, "cfo2@volkerkusch.de");
  assert.equal(result.team[0].invitationStatus, "pending");
});

test("mapped team satisfies the complete onboarding model", () => {
  const mapped = applyRoleIdentityPairs(legacyTeam, config).team;
  assert.deepEqual(validatePlannerTeam(mapped, config, { requireCompleteMatrix: true }), { ok: true, errors: [] });
});

test("worker permission escalation is rejected", () => {
  const mapped = applyRoleIdentityPairs(legacyTeam, config).team;
  mapped.find(({ role }) => role === "Bilanzbuchhaltung").can_view_all_tasks = true;
  const result = validatePlannerTeam(mapped, config, { requireCompleteMatrix: true });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("can_view_all_tasks")));
});

test("duplicate and overlapping addresses are rejected", () => {
  const mapped = applyRoleIdentityPairs(legacyTeam, config).team;
  mapped[1].email = mapped[0].email;
  mapped[2].deputyEmail = mapped[0].email;
  const result = validatePlannerTeam(mapped, config, { requireCompleteMatrix: true });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("eindeutig")));
  assert.ok(result.errors.some((error) => error.includes("Hauptperson und Stellvertretung")));
});

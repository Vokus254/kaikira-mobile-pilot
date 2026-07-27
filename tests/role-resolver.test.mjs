import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMemberContext,
  isActiveMembership,
  normalizeProjectRole,
  resolveCockpitProfile,
  supportedProjectRoles,
  validateCockpitProfile
} from "../assets/role-resolver.mjs";

const roleCases = [
  ["CFO / Geschäftsführung", "cfo"],
  ["Projektleitung Abschluss", "project"],
  ["Leiter Rechnungswesen", "accounting_lead"],
  ["Bilanzbuchhaltung", "worker"],
  ["Controlling", "worker"],
  ["Externe Beratung", "worker"],
  ["IT", "worker"],
  ["Investor Relations", "worker"],
  ["Konsolidierung", "worker"],
  ["Nachhaltigkeit", "worker"],
  ["Personal / HR", "worker"],
  ["Recht", "worker"],
  ["Steuern", "worker"],
  ["Treasury", "worker"],
  ["Wirtschaftsprüfung", "worker"]
];

test("all 15 business roles resolve to the approved profiles", () => {
  assert.equal(supportedProjectRoles.length, 15);
  for (const [role, profile] of roleCases) assert.equal(normalizeProjectRole(role)?.cockpitProfile, profile, role);
});

test("role normalization handles case, whitespace, umlauts and explicit synonyms", () => {
  assert.equal(normalizeProjectRole("  GESCHÄFTSFÜHRUNG ")?.cockpitProfile, "cfo");
  assert.equal(normalizeProjectRole("Geschaeftsfuehrung")?.cockpitProfile, "cfo");
  assert.equal(normalizeProjectRole("Wirtschaftspruefer")?.cockpitProfile, "worker");
  assert.equal(normalizeProjectRole("Bearbeiter / Bilanzbuchhalter")?.cockpitProfile, "worker");
  assert.equal(normalizeProjectRole("CFO Assistant"), null);
  assert.equal(normalizeProjectRole(""), null);
  assert.equal(normalizeProjectRole("unbekannte Rolle"), null);
});

test("only the four approved cockpit profiles validate", () => {
  for (const profile of ["cfo", "project", "accounting_lead", "worker"]) assert.equal(validateCockpitProfile(profile), profile);
  assert.equal(validateCockpitProfile("admin"), null);
  assert.equal(validateCockpitProfile(""), null);
});

test("stored profiles are accepted only when consistent with the business role", () => {
  assert.deepEqual(resolveCockpitProfile({ project_role: "Controlling", cockpit_profile: "worker" }), {
    status: "resolved", cockpitProfile: "worker", projectRole: "controlling", reason: "stored_profile"
  });
  assert.equal(resolveCockpitProfile({ project_role: "Controlling" }).cockpitProfile, "worker");
  assert.equal(resolveCockpitProfile({ project_role: "Controlling", cockpit_profile: "cfo" }).reason, "profile_role_conflict");
  assert.equal(resolveCockpitProfile({ project_role: "Unbekannt", cockpit_profile: "cfo" }).reason, "profile_without_supported_role");
  assert.equal(resolveCockpitProfile({ project_role: "CFO", cockpit_profile: "admin" }).reason, "invalid_cockpit_profile");
  assert.equal(resolveCockpitProfile({ access_level: "admin" }).cockpitProfile, null);
});

test("membership lifecycle is active only for accepted, linked identities", () => {
  assert.equal(isActiveMembership({ invitation_status: "accepted", user_id: "u-1" }), true);
  for (const status of ["pending", "invited", "declined", "inactive"]) {
    assert.equal(isActiveMembership({ invitation_status: status, user_id: "u-1" }), false, status);
  }
  assert.equal(isActiveMembership({ invitation_status: "accepted", user_id: null }), false);
});

const member = (overrides = {}) => ({
  id: "m-1", user_id: "u-1", email: "user@example.test", invitation_status: "accepted",
  project_role: "Bilanzbuchhaltung", cockpit_profile: "worker", ...overrides
});

test("classifyMemberContext resolves one matching active user_id", () => {
  const result = classifyMemberContext([member()], { id: "u-1", email: "USER@example.test" });
  assert.equal(result.status, "resolved");
  assert.equal(result.cockpitProfile, "worker");
});

test("classifyMemberContext fails closed for lifecycle and unsupported roles", () => {
  for (const status of ["pending", "invited", "declined", "inactive"]) {
    assert.equal(classifyMemberContext([member({ invitation_status: status })], { id: "u-1", email: "user@example.test" }).status, "inactive");
  }
  assert.equal(classifyMemberContext([member({ project_role: "Unknown", cockpit_profile: null })], { id: "u-1", email: "user@example.test" }).status, "unsupported_role");
});

test("legacy email fallback is identified but never grants active access", () => {
  const result = classifyMemberContext([member({ user_id: null })], { id: "u-new", email: "user@example.test" });
  assert.equal(result.status, "inactive");
  assert.equal(result.reason, "legacy_email_membership_requires_user_id");
  assert.equal(result.cockpitProfile, null);
});

test("ambiguous email, identity conflicts and duplicate memberships fail closed", () => {
  assert.equal(classifyMemberContext([
    member({ id: "m-1", user_id: null }), member({ id: "m-2", user_id: null })
  ], { id: "u-new", email: "user@example.test" }).status, "ambiguous");
  assert.equal(classifyMemberContext([
    member(), member({ id: "m-2", user_id: null })
  ], { id: "u-1", email: "user@example.test" }).reason, "user_id_email_conflict");
  assert.equal(classifyMemberContext([
    member(), member({ id: "m-2" })
  ], { id: "u-1", email: "user@example.test" }).reason, "multiple_user_id_memberships");
});

test("unauthenticated and missing memberships have no fallback profile", () => {
  assert.deepEqual(classifyMemberContext([], null), {
    status: "unauthenticated", member: null, cockpitProfile: null, projectRole: null, reason: "missing_authenticated_user"
  });
  assert.equal(classifyMemberContext([], { id: "u-1", email: "none@example.test" }).status, "no_membership");
});

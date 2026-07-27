import { normalizeProjectRole, validateCockpitProfile } from "./role-resolver.mjs";

export const ALLOWED_TEST_REF = "vcozprjecsprgyeqfahn";
export const BLOCKED_PRODUCTION_REF = "mslbzypjtvvznyewupco";
export const REQUIRED_ENV = Object.freeze(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LUMINA_TEST_PASSWORD", "LUMINA_EXPECTED_PROJECT_REF", "LUMINA_TARGET_PROJECT_ID"]);
export const PERMISSION_FIELDS = Object.freeze(["can_read", "can_upload", "can_edit", "can_approve", "can_manage_members", "can_view_all_tasks"]);

export function normalizeEmail(value) { return String(value ?? "").trim().toLowerCase(); }
export function projectRefFromUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") ? url.hostname.split(".")[0] : null;
  } catch { return null; }
}

export function validateProvisionEnvironment(env = {}) {
  const errors = REQUIRED_ENV.filter((name) => !String(env[name] ?? "").trim()).map((name) => `missing:${name}`);
  const ref = projectRefFromUrl(env.SUPABASE_URL);
  if (ref === BLOCKED_PRODUCTION_REF) errors.push("production_ref_blocked");
  if (ref && ref !== ALLOWED_TEST_REF) errors.push("test_ref_not_allowed");
  if (ref && env.LUMINA_EXPECTED_PROJECT_REF !== ref) errors.push("expected_ref_mismatch");
  if (env.LUMINA_EXPECTED_PROJECT_REF && env.LUMINA_EXPECTED_PROJECT_REF !== ALLOWED_TEST_REF) errors.push("expected_ref_not_allowed");
  if (env.LUMINA_ALLOW_PASSWORD_UPDATE && env.LUMINA_ALLOW_PASSWORD_UPDATE !== "true" && env.LUMINA_ALLOW_PASSWORD_UPDATE !== "false") errors.push("invalid_password_update_flag");
  return { ok: errors.length === 0, errors, projectRef: ref };
}

export function validateTestUsersConfig(config) {
  const users = Array.isArray(config?.users) ? config.users : [];
  const errors = [];
  if (users.length !== 30) errors.push("exactly_30_users_required");
  const emails = users.map(({ email }) => normalizeEmail(email));
  if (new Set(emails).size !== emails.length || emails.some((email) => !email.endsWith("@volkerkusch.de"))) errors.push("emails_must_be_unique_volkerkusch_addresses");
  const principals = users.filter(({ membership_kind }) => membership_kind === "principal");
  const substitutes = users.filter(({ membership_kind }) => membership_kind === "substitute");
  if (principals.length !== 15 || substitutes.length !== 15) errors.push("principal_substitute_count_invalid");
  const principalEmails = new Set(principals.map(({ email }) => normalizeEmail(email)));
  const roles = new Set(principals.map(({ project_role }) => project_role));
  if (roles.size !== 15) errors.push("exactly_15_principal_roles_required");
  for (const identity of users) {
    const email = normalizeEmail(identity.email), role = normalizeProjectRole(identity.project_role), profile = validateCockpitProfile(identity.cockpit_profile);
    if (!email || !identity.display_name || !role || !profile || role.cockpitProfile !== profile) errors.push(`invalid_identity:${email || "missing-email"}`);
    if (identity.invitation_status !== "accepted") errors.push(`invalid_invitation_status:${email}`);
    if (PERMISSION_FIELDS.some((field) => typeof identity[field] !== "boolean")) errors.push(`missing_permission:${email}`);
    if (identity.membership_kind === "substitute") {
      const principal = normalizeEmail(identity.principal_email);
      if (!principal || principal === email || !principalEmails.has(principal)) errors.push(`invalid_principal:${email}`);
      const principalIdentity = principals.find((candidate) => normalizeEmail(candidate.email) === principal);
      if (principalIdentity?.project_role !== identity.project_role) errors.push(`substitute_role_mismatch:${email}`);
    } else if (identity.principal_email) errors.push(`principal_must_not_reference_principal:${email}`);
    if (profile === "worker" && identity.can_view_all_tasks) errors.push(`worker_view_all_forbidden:${email}`);
    if (identity.project_role === "CFO / Geschäftsführung" && identity.can_manage_members) errors.push(`cfo_member_management_forbidden:${email}`);
    if (identity.membership_kind === "substitute" && identity.project_role === "Projektleitung Abschluss" && identity.can_manage_members) errors.push(`project_substitute_management_forbidden:${email}`);
    if (identity.project_role === "Wirtschaftsprüfung" && (identity.can_edit || identity.can_approve || identity.can_manage_members || identity.can_view_all_tasks || identity.can_upload)) errors.push(`auditor_management_forbidden:${email}`);
  }
  return { ok: errors.length === 0, errors, users, principals, substitutes };
}

function permissionMatch(member, identity) { return PERMISSION_FIELDS.every((field) => member[field] === identity[field]); }
function memberMatches(member, identity, authUser) {
  return member.project_role === identity.project_role && member.cockpit_profile === identity.cockpit_profile && member.invitation_status === "accepted" && permissionMatch(member, identity) && (!authUser || member.user_id === authUser.id);
}

export function createProvisionPlan(config, state, options = {}) {
  const validation = validateTestUsersConfig(config);
  if (!validation.ok) return { ok: false, conflicts: validation.errors, rows: [], actions: [] };
  const authByEmail = new Map((state.authUsers ?? []).map((user) => [normalizeEmail(user.email), user]));
  const membersByEmail = new Map();
  for (const member of state.members ?? []) {
    const email = normalizeEmail(member.email), list = membersByEmail.get(email) ?? [];
    list.push(member);membersByEmail.set(email, list);
  }
  const actions = [], conflicts = [], rows = [];
  for (const identity of validation.users) {
    const email = normalizeEmail(identity.email), authUser = authByEmail.get(email), matches = membersByEmail.get(email) ?? [];
    let authStatus = authUser ? "reuse" : "create", memberStatus = "create";
    if (matches.length > 1) conflicts.push(`duplicate_membership:${email}`);
    const existing = matches[0];
    if (existing) {
      if (existing.user_id && authUser && existing.user_id !== authUser.id) conflicts.push(`member_user_conflict:${email}`);
      else if (existing.user_id && !authUser) conflicts.push(`orphan_member_user_id:${email}`);
      else if (memberMatches(existing, identity, authUser)) memberStatus = "correct";
      else if (!existing.user_id && (!authUser || existing.project_role === identity.project_role)) memberStatus = "link";
      else conflicts.push(`member_data_conflict:${email}`);
    }
    if (!authUser) actions.push({ type: "create_auth_user", email, identity });
    else if (options.updatePasswords) actions.push({ type: "update_password", email, userId: authUser.id });
    if (!existing) actions.push({ type: "create_member", email, identity });
    else if (memberStatus === "link") actions.push({ type: "link_member", email, memberId: existing.id, identity });
    rows.push({ email, membership_kind: identity.membership_kind, project_role: identity.project_role, cockpit_profile: identity.cockpit_profile, auth_status: authStatus, member_status: memberStatus, user_id: authUser?.id ?? null, invitation_status: existing?.invitation_status ?? "planned", substitution_status: identity.membership_kind === "principal" ? "not_applicable" : "planned", result: "planned", error: "" });
  }
  const relationKeys = new Set((state.substitutions ?? []).filter((row) => row.status === "active" && (!state.projectId || row.project_id === state.projectId)).map((row) => `${row.principal_email}|${row.substitute_email}`));
  for (const identity of validation.substitutes) {
    const key = `${normalizeEmail(identity.principal_email)}|${normalizeEmail(identity.email)}`;
    const row = rows.find(({ email }) => email === normalizeEmail(identity.email));
    if (relationKeys.has(key)) row.substitution_status = "correct";
    else actions.push({ type: "create_substitution", principalEmail: normalizeEmail(identity.principal_email), substituteEmail: normalizeEmail(identity.email) });
  }
  return { ok: conflicts.length === 0, conflicts, rows, actions };
}

export function createCleanupPlan(config, state, { deleteAuthUsers = false } = {}) {
  const validation = validateTestUsersConfig(config);
  if (!validation.ok) return { ok: false, conflicts: validation.errors, actions: [] };
  const allowed = new Set(validation.users.map(({ email }) => normalizeEmail(email))), actions = [], conflicts = [];
  for (const relation of state.substitutions ?? []) if ((!state.projectId || relation.project_id === state.projectId) && allowed.has(normalizeEmail(relation.principal_email)) && allowed.has(normalizeEmail(relation.substitute_email))) actions.push({ type: "delete_substitution", id: relation.id });
  for (const member of state.members ?? []) if ((!state.projectId || member.project_id === state.projectId) && allowed.has(normalizeEmail(member.email))) actions.push({ type: "delete_member", id: member.id, email: normalizeEmail(member.email) });
  if (deleteAuthUsers) for (const user of state.authUsers ?? []) if (allowed.has(normalizeEmail(user.email))) {
    if (user.user_metadata?.lumina_synthetic_test === true) actions.push({ type: "delete_auth_user", id: user.id, email: normalizeEmail(user.email) });
    else conflicts.push(`auth_user_not_marked_synthetic:${normalizeEmail(user.email)}`);
  }
  return { ok: conflicts.length === 0, conflicts, actions };
}

export function shortId(value) { const id = String(value ?? ""); return id ? `${id.slice(0, 8)}…` : "–"; }
export function sanitizeReportValue(value) { return String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, 180); }

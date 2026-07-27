const VALID_PROFILES = new Set(["cfo", "project", "accounting_lead", "worker"]);

const ROLE_DEFINITIONS = [
  ["cfo_geschaeftsfuehrung", "cfo", ["cfo", "geschaeftsfuehrung", "cfo geschaeftsfuehrung", "geschaeftsfuehrung cfo"]],
  ["projektleitung_abschluss", "project", ["projektleitung abschluss", "projektleitung jahresabschluss", "abschlussprojektleitung"]],
  ["leiter_rechnungswesen", "accounting_lead", ["leiter rechnungswesen", "leitung rechnungswesen"]],
  ["bilanzbuchhaltung", "worker", ["bilanzbuchhaltung", "bilanzbuchhalter", "bearbeiter", "bearbeiter bilanzbuchhalter"]],
  ["controlling", "worker", ["controlling", "controller"]],
  ["externe_beratung", "worker", ["externe beratung", "externer berater", "externe beraterin"]],
  ["it", "worker", ["it", "informationstechnologie"]],
  ["investor_relations", "worker", ["investor relations"]],
  ["konsolidierung", "worker", ["konsolidierung"]],
  ["nachhaltigkeit", "worker", ["nachhaltigkeit", "sustainability"]],
  ["personal_hr", "worker", ["personal hr", "personal", "hr", "human resources"]],
  ["recht", "worker", ["recht", "legal"]],
  ["steuern", "worker", ["steuern", "steuer"]],
  ["treasury", "worker", ["treasury"]],
  ["wirtschaftspruefung", "worker", ["wirtschaftspruefung", "wirtschaftspruefer"]]
];

function fold(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ROLE_LOOKUP = new Map();
for (const [canonicalRole, cockpitProfile, aliases] of ROLE_DEFINITIONS) {
  for (const alias of aliases) ROLE_LOOKUP.set(fold(alias), { canonicalRole, cockpitProfile });
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

export function normalizeProjectRole(role) {
  const normalized = fold(role);
  if (!normalized) return null;
  const match = ROLE_LOOKUP.get(normalized);
  return match ? { ...match } : null;
}

export function validateCockpitProfile(profile) {
  const normalized = String(profile ?? "").trim().toLowerCase();
  return VALID_PROFILES.has(normalized) ? normalized : null;
}

export function resolveCockpitProfile(member) {
  if (!member || typeof member !== "object") {
    return { status: "unsupported", cockpitProfile: null, projectRole: null, reason: "missing_member" };
  }

  const role = normalizeProjectRole(member.project_role);
  const storedProfile = validateCockpitProfile(member.cockpit_profile);
  if (!role) {
    return {
      status: "unsupported",
      cockpitProfile: null,
      projectRole: null,
      reason: storedProfile ? "profile_without_supported_role" : "unsupported_role"
    };
  }
  if (member.cockpit_profile != null && !storedProfile) {
    return { status: "unsupported", cockpitProfile: null, projectRole: role.canonicalRole, reason: "invalid_cockpit_profile" };
  }
  if (storedProfile && storedProfile !== role.cockpitProfile) {
    return { status: "unsupported", cockpitProfile: null, projectRole: role.canonicalRole, reason: "profile_role_conflict" };
  }

  return {
    status: "resolved",
    cockpitProfile: storedProfile ?? role.cockpitProfile,
    projectRole: role.canonicalRole,
    reason: storedProfile ? "stored_profile" : "project_role"
  };
}

export function isActiveMembership(member) {
  return Boolean(
    member &&
    member.user_id &&
    String(member.invitation_status ?? "").trim().toLowerCase() === "accepted"
  );
}

export function classifyMemberContext(members, user) {
  const base = { member: null, cockpitProfile: null, projectRole: null };
  if (!user?.id) return { status: "unauthenticated", ...base, reason: "missing_authenticated_user" };

  const candidates = Array.isArray(members) ? members.filter(Boolean) : [];
  const userEmail = normalizeEmail(user.email);
  const idMatches = candidates.filter((member) => member.user_id === user.id);
  const emailMatches = userEmail
    ? candidates.filter((member) => normalizeEmail(member.email) === userEmail)
    : [];

  if (idMatches.length > 1) {
    return { status: "ambiguous", ...base, reason: "multiple_user_id_memberships" };
  }

  if (idMatches.length === 1) {
    const member = idMatches[0];
    const conflictingEmail = emailMatches.some((candidate) => candidate.id !== member.id);
    if (conflictingEmail || (normalizeEmail(member.email) && userEmail && normalizeEmail(member.email) !== userEmail)) {
      return { status: "ambiguous", ...base, reason: "user_id_email_conflict" };
    }
    if (!isActiveMembership(member)) {
      return { status: "inactive", ...base, member, reason: "membership_not_accepted" };
    }
    const resolved = resolveCockpitProfile(member);
    if (resolved.status !== "resolved") {
      return { status: "unsupported_role", ...base, member, projectRole: resolved.projectRole, reason: resolved.reason };
    }
    return {
      status: "resolved",
      member,
      cockpitProfile: resolved.cockpitProfile,
      projectRole: resolved.projectRole,
      reason: "user_id"
    };
  }

  if (emailMatches.length > 1) {
    return { status: "ambiguous", ...base, reason: "multiple_email_memberships" };
  }
  if (emailMatches.length === 1) {
    const member = emailMatches[0];
    if (member.user_id && member.user_id !== user.id) {
      return { status: "ambiguous", ...base, reason: "email_bound_to_different_user" };
    }
    return {
      status: "inactive",
      ...base,
      member,
      projectRole: normalizeProjectRole(member.project_role)?.canonicalRole ?? null,
      reason: "legacy_email_membership_requires_user_id"
    };
  }

  return { status: "no_membership", ...base, reason: "no_matching_membership" };
}

export const supportedProjectRoles = Object.freeze(
  ROLE_DEFINITIONS.map(([canonicalRole, cockpitProfile]) => ({ canonicalRole, cockpitProfile }))
);

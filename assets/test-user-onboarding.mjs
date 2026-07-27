import { PERMISSION_FIELDS, normalizeEmail, validateTestUsersConfig } from "./test-user-provisioning.mjs";

const clonePermissions = (identity) => Object.fromEntries(PERMISSION_FIELDS.map((field) => [field, identity[field]]));

export function buildRoleIdentityPairs(config) {
  const validation = validateTestUsersConfig(config);
  if (!validation.ok) return { ok: false, errors: validation.errors, pairs: [] };
  const substituteByPrincipal = new Map(validation.substitutes.map((identity) => [normalizeEmail(identity.principal_email), identity]));
  const pairs = validation.principals.map((principal) => {
    const substitute = substituteByPrincipal.get(normalizeEmail(principal.email));
    return {
      role: principal.project_role,
      principal: { ...principal, permissions: clonePermissions(principal) },
      substitute: { ...substitute, permissions: clonePermissions(substitute) }
    };
  });
  return { ok: true, errors: [], pairs };
}

export function roleDefaultsFor(config, role) {
  const result = buildRoleIdentityPairs(config);
  if (!result.ok) return { ok: false, errors: result.errors, defaults: null };
  const pair = result.pairs.find((candidate) => candidate.role === role);
  if (!pair) return { ok: false, errors: [`Unbekannte Rolle: ${role || "ohne Angabe"}.`], defaults: null };
  return { ok: true, errors: [], defaults: pair };
}

export function buildOnboardingPreview(team, config) {
  const pairs = buildRoleIdentityPairs(config);
  if (!pairs.ok) return pairs;
  const existingByRole = new Map((Array.isArray(team) ? team : []).map((member) => [member.role, member]));
  return {
    ok: true,
    errors: [],
    rows: pairs.pairs.flatMap(({ role, principal, substitute }) => {
      const existing = existingByRole.get(role) ?? {};
      return [
        { old_email: normalizeEmail(existing.email) || "–", new_email: principal.email, role, membership_kind: "principal" },
        { old_email: normalizeEmail(existing.deputyEmail) || "–", new_email: substitute.email, role, membership_kind: "substitute" }
      ];
    }),
    pairs: pairs.pairs
  };
}

export function applyRoleIdentityPairs(team, config) {
  const preview = buildOnboardingPreview(team, config);
  if (!preview.ok) return preview;
  const existingByRole = new Map((Array.isArray(team) ? team : []).map((member) => [member.role, member]));
  const mappedTeam = preview.pairs.map(({ role, principal, substitute }) => ({
    ...(existingByRole.get(role) ?? {}),
    role,
    name: principal.display_name,
    email: principal.email,
    deputy: substitute.display_name,
    deputyEmail: substitute.email,
    cockpitProfile: principal.cockpit_profile,
    substituteCockpitProfile: substitute.cockpit_profile,
    membershipKind: "principal",
    invitationStatus: "pending",
    ...principal.permissions,
    ...Object.fromEntries(PERMISSION_FIELDS.map((field) => [`substitute_${field}`, substitute[field]]))
  }));
  return { ok: true, errors: [], team: mappedTeam, preview: preview.rows };
}

export function validatePlannerTeam(team, config, { requireCompleteMatrix = false } = {}) {
  const configValidation = validateTestUsersConfig(config);
  if (!configValidation.ok) return { ok: false, errors: configValidation.errors };
  const rows = Array.isArray(team) ? team : [];
  const errors = [];
  const pairByRole = new Map(buildRoleIdentityPairs(config).pairs.map((pair) => [pair.role, pair]));
  const populated = rows.filter((member) => member.name || member.email || member.deputy || member.deputyEmail);
  const roles = populated.map(({ role }) => role);
  if (requireCompleteMatrix && populated.length !== 15) errors.push("Es müssen genau 15 Hauptrollen vorbereitet sein.");
  if (new Set(roles).size !== roles.length) errors.push("Jede Hauptrolle darf höchstens einmal vorkommen.");
  const principalEmails = populated.map(({ email }) => normalizeEmail(email)).filter(Boolean);
  const substituteEmails = populated.map(({ deputyEmail }) => normalizeEmail(deputyEmail)).filter(Boolean);
  if (new Set(principalEmails).size !== principalEmails.length) errors.push("Hauptadressen müssen eindeutig sein.");
  if (new Set(substituteEmails).size !== substituteEmails.length) errors.push("Stellvertreteradressen müssen eindeutig sein.");
  if (principalEmails.some((email) => substituteEmails.includes(email))) errors.push("Eine Adresse darf nicht Hauptperson und Stellvertretung zugleich sein.");
  for (const member of populated) {
    const pair = pairByRole.get(member.role);
    if (!pair) { errors.push(`Unbekannte Rolle: ${member.role || "ohne Angabe"}.`); continue; }
    if (!member.email || !member.deputyEmail) errors.push(`${member.role}: Haupt- und Stellvertreteradresse sind erforderlich.`);
    if (member.cockpitProfile !== pair.principal.cockpit_profile) errors.push(`${member.role}: Cockpitprofil passt nicht zur Rolle.`);
    if (member.substituteCockpitProfile !== pair.substitute.cockpit_profile) errors.push(`${member.role}: Cockpitprofil der Stellvertretung passt nicht zur Rolle.`);
    for (const field of PERMISSION_FIELDS) if (member[field] !== pair.principal[field]) errors.push(`${member.role}: Ungültige Berechtigung ${field}.`);
    for (const field of PERMISSION_FIELDS) if (member[`substitute_${field}`] !== pair.substitute[field]) errors.push(`${member.role}: Ungültige Stellvertreterberechtigung ${field}.`);
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

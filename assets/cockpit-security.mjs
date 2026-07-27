const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function groupMembershipsByProject(members = []) {
  const grouped = new Map();
  for (const member of members.filter(Boolean)) {
    const list = grouped.get(member.project_id) ?? [];
    list.push(member);
    grouped.set(member.project_id, list);
  }
  return grouped;
}

export function acceptedProjectContexts(members, user, classifyMemberContext) {
  const contexts = [];
  const rejected = [];
  for (const [projectId, projectMembers] of groupMembershipsByProject(members)) {
    const context = classifyMemberContext(projectMembers, user);
    const entry = { projectId, ...context };
    (context.status === "resolved" ? contexts : rejected).push(entry);
  }
  return { contexts, rejected };
}

export function validatedProjectChoice({ requested, remembered, contexts = [], projects = [] }) {
  const allowed = new Set(contexts.map((context) => context.projectId));
  const visible = new Set(projects.map((project) => project.id));
  const candidates = [requested, remembered].filter((id) => UUID_PATTERN.test(String(id ?? "")));
  const selected = candidates.find((id) => allowed.has(id) && visible.has(id)) ?? null;
  if (selected) return selected;
  return contexts.length === 1 && visible.has(contexts[0].projectId) ? contexts[0].projectId : null;
}

export function navigationFor(context) {
  const profile = context?.cockpitProfile;
  const member = context?.member;
  const auditor = context?.projectRole === "wirtschaftspruefung" || String(member?.project_role ?? "").toLowerCase().includes("wirtschaftspr");
  return {
    planner: Boolean(member?.can_edit && ["cfo", "project", "accounting_lead"].includes(profile)),
    admin: Boolean(member?.can_manage_members),
    operationalDashboard: ["project", "accounting_lead"].includes(profile),
    internalManagement: profile !== "worker" || !auditor
  };
}

export function isActiveSubstitution(row, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(row && row.status === "active" && (!row.starts_on || row.starts_on <= today) && (!row.ends_on || row.ends_on >= today));
}

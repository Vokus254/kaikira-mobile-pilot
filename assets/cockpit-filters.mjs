export const COCKPIT_FILTERS = Object.freeze({
  all: "Alle Aufgaben", open: "Offene Aufgaben", done: "Erledigt / freigegeben",
  overdue: "Überfällige Aufgaben", today: "Heute fällige Aufgaben", critical: "Kritische Aufgaben", blocked: "Blockierte Aufgaben",
  questions: "Offene Rückfragen", rework: "Nachbesserungen", review: "Offene Reviews", decisions: "Entscheidungsbedarf", unassigned: "Nicht zugeordnet", invitations: "Offene Einladungen",
  mine: "Meine Aufgaben", substitutions: "Stellvertretungsaufgaben"
});

export function normalizeCockpitFilter(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(COCKPIT_FILTERS, normalized) ? normalized : "all";
}

export function taskMatchesFilter(task, filter, context = {}) {
  const value = normalizeCockpitFilter(filter);
  const done = ["completed", "approved"].includes(task.status);
  const today = context.today ?? new Date().toISOString().slice(0, 10);
  const overdue = Boolean(task.due_date && task.due_date < today && !done);
  const own = task.responsible_member_id === context.memberId;
  const substitution = context.substitutionPrincipalIds?.has(task.responsible_member_id) ?? false;
  return value === "all"
    || (value === "open" && !done)
    || (value === "done" && done)
    || (value === "overdue" && overdue)
    || (value === "today" && !done && task.due_date === today)
    || (value === "critical" && !done && (overdue || ["blocked", "declined"].includes(task.status)))
    || (value === "blocked" && task.status === "blocked")
    || (value === "questions" && task.status === "question")
    || (value === "rework" && ["declined", "question"].includes(task.status))
    || (value === "review" && ["submitted", "in_review"].includes(task.status))
    || (value === "decisions" && ["submitted", "in_review", "question"].includes(task.status))
    || (value === "unassigned" && !task.responsible_member_id && !task.responsible_email)
    || (value === "invitations" && false)
    || (value === "mine" && own)
    || (value === "substitutions" && substitution);
}

import { createHash } from "node:crypto";
import {
  CRM_AI_COST_TARGET_USD,
  CRM_EXPORT_SCHEMA_VERSION,
  CRM_EXPORT_TIME_ZONE,
  type CrmAppRole,
  type CrmExportClient,
  type CrmExportDaily,
  type CrmExportMonthly,
  type CrmExportPayload,
  type CrmExportUserMonthly,
  type CrmSourceRows
} from "./crm-export-types";

const ACTIVE_WINDOW_DAYS = 30;
const localDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CRM_EXPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/** Calendar day of a timestamp in the export time zone (YYYY-MM-DD). */
export function localDate(iso: string): string {
  return localDateFormat.format(new Date(iso));
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysInRange(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  for (let day = dateFrom; day <= dateTo; day = addDays(day, 1)) days.push(day);
  return days;
}

export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Months a batch recomputes: those touched by the range, plus the previous one in its first 5 days. */
export function exportMonths(dateFrom: string, dateTo: string): string[] {
  const months = new Set(daysInRange(dateFrom, dateTo).map(monthOf));
  if (Number(dateTo.slice(8, 10)) <= 5) months.add(monthOf(addDays(monthOf(dateTo), -1)));
  return [...months].sort();
}

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeRole(role: string | null): CrmAppRole {
  if (role && ["owner", "admin", "administrator"].includes(role)) return "administrator";
  if (role && ["viewer", "observer"].includes(role)) return "observer";
  return "team_member";
}

function nearestRankPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1)];
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function distinctBy<T>(items: T[], key: (item: T) => string, value: (item: T) => string): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const item of items) {
    const set = sets.get(key(item)) ?? new Set<string>();
    set.add(value(item));
    sets.set(key(item), set);
  }
  return new Map([...sets].map(([group, set]) => [group, set.size]));
}

type ResultRow = { userId: string; date: string };

function buildClient(
  clientKey: string,
  name: string,
  rows: CrmSourceRows,
  days: string[],
  months: string[],
  dateTo: string
): CrmExportClient {
  const users = rows.users.filter((user) => user.clientId === clientKey);
  const events = rows.events.filter((event) => event.clientId === clientKey).map((event) => ({ ...event, date: localDate(event.createdAt) }));
  const aiUsage = rows.aiUsage.filter((usage) => usage.clientId === clientKey).map((usage) => ({ ...usage, date: localDate(usage.createdAt) }));
  const pdfOutcomes = rows.pdfOutcomes.filter((outcome) => outcome.clientId === clientKey).map((outcome) => ({ ...outcome, date: localDate(outcome.decidedAt) }));

  // Projects are hard-deleted; their tombstones keep the creation for history.
  const createdProjects = new Map<string, { userId: string; date: string }>();
  for (const project of rows.projects.filter((item) => item.clientId === clientKey)) {
    createdProjects.set(project.projectId, { userId: project.createdByUserId, date: localDate(project.createdAt) });
  }
  for (const event of events.filter((item) => item.eventType === "project.deleted")) {
    const createdAt = event.data.projectCreatedAt;
    if (createdProjects.has(event.projectId) || typeof createdAt !== "string") continue;
    const createdBy = typeof event.data.projectCreatedByUserId === "string" ? event.data.projectCreatedByUserId : event.actorUserId;
    createdProjects.set(event.projectId, { userId: createdBy, date: localDate(createdAt) });
  }
  const projectsCreated = [...createdProjects.entries()].map(([projectId, item]) => ({ projectId, ...item }));

  const pdfEvents = events.filter((event) => event.eventType === "offer.pdf_generated");
  const sheetEvents = events.filter((event) => event.eventType === "offer.sheet_generated");
  const sentEvents = events.filter((event) => event.eventType === "offer.marked_sent");
  const revertEvents = events.filter((event) => event.eventType === "offer.sent_reverted");
  const proposedOutcomes = pdfOutcomes.filter((outcome) => outcome.proposedBy !== "user");

  // A user is active on a day when they produced a result (project, offer, PDF decision) in the 30 days before.
  const results: ResultRow[] = [
    ...projectsCreated.map((item) => ({ userId: item.userId, date: item.date })),
    ...[...pdfEvents, ...sheetEvents, ...sentEvents].map((event) => ({ userId: event.actorUserId, date: event.date })),
    ...pdfOutcomes.flatMap((outcome) => (outcome.decidedByUserId ? [{ userId: outcome.decidedByUserId, date: outcome.date }] : []))
  ];
  const activeUsersOn = (day: string) => new Set(
    results.filter((result) => result.date <= day && result.date > addDays(day, -ACTIVE_WINDOW_DAYS)).map((result) => result.userId)
  ).size;

  const byDay = <T extends { date: string }>(items: T[]) => countBy(items, (item) => item.date);
  const created = byDay(projectsCreated);
  const deleted = byDay(events.filter((event) => event.eventType === "project.deleted"));
  const generated = distinctBy(pdfEvents, (event) => event.date, (event) => event.projectId);
  const sheets = distinctBy(sheetEvents, (event) => event.date, (event) => event.projectId);
  const sent = byDay(sentEvents);
  const reverted = byDay(revertEvents);
  const documents = distinctBy(pdfOutcomes, (outcome) => outcome.date, (outcome) => `${outcome.projectId}:${outcome.documentSha256}`);
  const proposed = byDay(proposedOutcomes);
  const corrected = byDay(proposedOutcomes.filter((outcome) => outcome.outcome === "corrected"));
  const rejected = byDay(proposedOutcomes.filter((outcome) => outcome.outcome === "rejected"));
  const added = byDay(pdfOutcomes.filter((outcome) => outcome.outcome === "added_by_user"));
  const usersTotal = users.filter((user) => user.isActive).length;

  const daily: CrmExportDaily[] = days.map((day) => {
    const usage = aiUsage.filter((item) => item.date === day);
    const cost = (prefix: string | null) => money(usage
      .filter((item) => prefix === null
        ? !item.feature.startsWith("pdf_intake") && !item.feature.startsWith("assistant")
        : item.feature.startsWith(prefix))
      .reduce((total, item) => total + item.costUsd, 0));
    return {
      date: day,
      users_total: usersTotal,
      users_active_30d: activeUsersOn(day),
      projects_created: created.get(day) ?? 0,
      projects_deleted: deleted.get(day) ?? 0,
      offers_generated: generated.get(day) ?? 0,
      offers_sheet_generated: sheets.get(day) ?? 0,
      offers_sent: (sent.get(day) ?? 0) - (reverted.get(day) ?? 0),
      pdf_documents_processed: documents.get(day) ?? 0,
      pdf_items_proposed: proposed.get(day) ?? 0,
      pdf_items_corrected: corrected.get(day) ?? 0,
      pdf_items_rejected: rejected.get(day) ?? 0,
      pdf_items_added_by_user: added.get(day) ?? 0,
      ai_cost_usd_pdf: cost("pdf_intake"),
      ai_cost_usd_assistant: cost("assistant"),
      ai_cost_usd_other: cost(null),
      ai_calls: usage.length,
      ai_calls_unpriced: usage.filter((item) => item.costBasis === "unpriced").length
    };
  });

  const monthly: CrmExportMonthly[] = months.map((month) => {
    const usage = aiUsage.filter((item) => monthOf(item.date) === month);
    const perProject = new Map<string, number>();
    for (const item of usage) {
      if (item.projectId) perProject.set(item.projectId, (perProject.get(item.projectId) ?? 0) + item.costUsd);
    }
    const costs = [...perProject.values()].sort((a, b) => a - b);
    return {
      month,
      projects_with_ai: costs.length,
      ai_cost_per_project_avg_usd: money(costs.length ? costs.reduce((total, value) => total + value, 0) / costs.length : 0),
      ai_cost_per_project_p90_usd: money(nearestRankPercentile(costs, 0.9)),
      ai_cost_per_project_max_usd: money(costs.at(-1) ?? 0),
      projects_over_target: costs.filter((value) => value > CRM_AI_COST_TARGET_USD).length,
      ai_cost_usd_without_project: money(usage.filter((item) => !item.projectId).reduce((total, item) => total + item.costUsd, 0))
    };
  });

  const userMonthly: CrmExportUserMonthly[] = users.flatMap((user) => months.map((month) => {
    const inMonth = <T extends { date: string }>(items: T[]) => items.filter((item) => monthOf(item.date) === month);
    const decided = inMonth(pdfOutcomes.filter((outcome) => outcome.decidedByUserId === user.userId));
    const decidedProposals = decided.filter((outcome) => outcome.proposedBy !== "user");
    return {
      user_key: `${clientKey}:${user.userId}`,
      month,
      projects_created: inMonth(projectsCreated.filter((item) => item.userId === user.userId)).length,
      offers_generated: new Set(inMonth(pdfEvents.filter((event) => event.actorUserId === user.userId)).map((event) => event.projectId)).size,
      offers_sent: inMonth(sentEvents.filter((event) => event.actorUserId === user.userId)).length
        - inMonth(revertEvents.filter((event) => event.actorUserId === user.userId)).length,
      pdf_documents_processed: new Set(decided.map((outcome) => `${outcome.projectId}:${outcome.documentSha256}`)).size,
      pdf_items_proposed: decidedProposals.length,
      pdf_items_corrected: decidedProposals.filter((outcome) => outcome.outcome === "corrected").length
    };
  }));

  const recentlyActive = new Set(results
    .filter((result) => result.date <= dateTo && result.date > addDays(dateTo, -ACTIVE_WINDOW_DAYS))
    .map((result) => result.userId));
  return {
    client_key: clientKey,
    name,
    users: users.map((user) => ({
      user_key: `${clientKey}:${user.userId}`,
      name: user.name,
      position: user.position,
      app_role: normalizeRole(user.role),
      state: !user.isActive ? "deactivated" : recentlyActive.has(user.userId) ? "active_30d" : "inactive"
    })),
    daily,
    monthly,
    user_monthly: userMonthly
  };
}

export function buildCrmExportPayload(args: {
  rows: CrmSourceRows;
  clientKeys: readonly string[];
  dateFrom: string;
  dateTo: string;
  environment: string;
  generatedAt: Date;
}): CrmExportPayload {
  const days = daysInRange(args.dateFrom, args.dateTo);
  const months = exportMonths(args.dateFrom, args.dateTo);
  const allowed = new Set(args.clientKeys);
  const clients = args.rows.organizations
    .filter((organization) => allowed.has(organization.clientId))
    .sort((a, b) => a.clientId.localeCompare(b.clientId))
    .map((organization) => buildClient(organization.clientId, organization.name, args.rows, days, months, args.dateTo));
  const dailyRows = clients.flatMap((client) => client.daily);
  const controlTotals = {
    projects_created: dailyRows.reduce((total, row) => total + row.projects_created, 0),
    offers_sent: dailyRows.reduce((total, row) => total + row.offers_sent, 0),
    ai_cost_usd: money(dailyRows.reduce((total, row) => total + row.ai_cost_usd_pdf + row.ai_cost_usd_assistant + row.ai_cost_usd_other, 0)),
    ai_calls: dailyRows.reduce((total, row) => total + row.ai_calls, 0)
  };
  const content = {
    schema_version: CRM_EXPORT_SCHEMA_VERSION,
    environment: args.environment,
    timezone: CRM_EXPORT_TIME_ZONE,
    date_from: args.dateFrom,
    date_to: args.dateTo,
    clients,
    control_totals: controlTotals
  } as const;
  // Content-addressed: replaying identical data reuses the batch ID; changed data gets a new one.
  const digest = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return {
    ...content,
    batch_id: `${args.environment}:${args.dateFrom}..${args.dateTo}:${digest.slice(0, 16)}`,
    generated_at: args.generatedAt.toISOString()
  };
}

export function payloadSha256(payload: CrmExportPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

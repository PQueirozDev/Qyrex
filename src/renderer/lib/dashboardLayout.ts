import { DASHBOARD_WIDGETS, type DashboardWidgetId, type DashboardWidgetSize } from "@shared/types";

export function normalizeDashboardOrder(order: readonly unknown[] = []): DashboardWidgetId[] {
  const known = order.filter((id): id is DashboardWidgetId => (DASHBOARD_WIDGETS as readonly unknown[]).includes(id));
  return [...new Set([...known, ...DASHBOARD_WIDGETS])];
}

/** Move por identidade, incluindo widgets ocultos, sem perder entradas antigas. */
export function moveDashboardWidget(order: readonly DashboardWidgetId[], source: DashboardWidgetId, target: DashboardWidgetId): DashboardWidgetId[] {
  const next = normalizeDashboardOrder(order);
  if (source === target || !next.includes(source) || !next.includes(target)) return next;
  const targetIndex = next.indexOf(target);
  next.splice(next.indexOf(source), 1);
  next.splice(targetIndex, 0, source);
  return next;
}

export function dashboardWidgetSize(id: DashboardWidgetId, sizes?: Partial<Record<DashboardWidgetId, DashboardWidgetSize>>): DashboardWidgetSize {
  return sizes?.[id] ?? (id === "projetos" ? "wide" : "compact");
}

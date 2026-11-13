import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGETS } from "../../src/shared/types";
import { dashboardWidgetSize, moveDashboardWidget, normalizeDashboardOrder } from "../../src/renderer/lib/dashboardLayout";

describe("organização do Início", () => {
  it("mantém widgets novos e remove repetições e entradas antigas", () => {
    const order = normalizeDashboardOrder(["foco", "foco", "cobrancas"]);
    expect(order[0]).toBe("foco");
    expect(order).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(new Set(order)).toEqual(new Set(DASHBOARD_WIDGETS));
  });
  it("move em ambas as direções sem excluir widgets ocultos ou alterar o original", () => {
    const original = [...DASHBOARD_WIDGETS];
    const moved = moveDashboardWidget(original, "avisos", "agenda");
    expect(moved[0]).toBe("avisos");
    expect(moveDashboardWidget(moved, "avisos", "agenda")[1]).toBe("avisos");
    expect(original).toEqual(DASHBOARD_WIDGETS);
    expect(new Set(moved)).toEqual(new Set(DASHBOARD_WIDGETS));
  });
  it("preserva tamanhos anteriores e aceita sobrescrever os padrões", () => {
    expect(dashboardWidgetSize("projetos")).toBe("wide");
    expect(dashboardWidgetSize("agenda")).toBe("compact");
    expect(dashboardWidgetSize("projetos", { projetos: "compact" })).toBe("compact");
    expect(dashboardWidgetSize("agenda", { agenda: "wide" })).toBe("wide");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, IpcResult } from "../../src/shared/types";

vi.mock("../../src/renderer/lib/i18n", () => ({ tr: (text: string) => text }));
vi.mock("../../src/renderer/stores/useUIStore", () => ({ toast: { error: vi.fn(), success: vi.fn() }, confirmAction: vi.fn() }));
import { useSettingsStore } from "../../src/renderer/stores/useSettingsStore";

const previous = { userName: "Pedro", dashboard: { order: [], hidden: [] } } as unknown as AppSettings;
const update = vi.fn<(patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>>();

beforeEach(() => {
  update.mockReset();
  useSettingsStore.setState({ settings: previous });
  vi.stubGlobal("window", { workspace: { settings: { update } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("salvamento de preferências", () => {
  it("confirma sucesso só com a resposta persistida", async () => {
    const saved = { ...previous, dashboard: { order: [], hidden: [], sizes: { agenda: "wide" as const } } };
    update.mockResolvedValue({ ok: true, data: saved });
    expect(await useSettingsStore.getState().update({ dashboard: saved.dashboard })).toBe(true);
    expect(useSettingsStore.getState().settings).toBe(saved);
  });

  it("desfaz a preferência otimista e retorna falha quando a gravação é recusada", async () => {
    update.mockResolvedValue({ ok: false, error: "Falha ao gravar" });
    expect(await useSettingsStore.getState().update({ userName: "Novo nome" })).toBe(false);
    expect(useSettingsStore.getState().settings).toBe(previous);
  });

  it("não desfaz uma mudança posterior quando uma solicitação antiga falha", async () => {
    let rejectFirst!: (error: Error) => void;
    update.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }));
    const first = useSettingsStore.getState().update({ userName: "Rascunho" });
    const newer = { ...previous, userName: "Nome salvo depois" };
    update.mockResolvedValueOnce({ ok: true, data: newer });
    await useSettingsStore.getState().update({ userName: newer.userName });
    rejectFirst(new Error("Conexão interrompida"));
    expect(await first).toBe(false);
    expect(useSettingsStore.getState().settings).toBe(newer);
  });
});

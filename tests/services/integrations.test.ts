import { describe, expect, it, beforeEach } from "vitest";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "../../src/main/services/systemService";
import { remoteToGithubUrl } from "../../src/main/services/gitService";
import { parseRepo } from "../../src/main/integrations/github";
import { normalizeGoogleEvent } from "../../src/main/integrations/googleCalendar";
import { createPkcePair } from "../../src/main/integrations/oauth";
import { dueReminders, localDate } from "../../src/main/services/notificationService";
import * as tasks from "../../src/main/services/taskService";
import * as calendar from "../../src/main/services/calendarService";
import * as clients from "../../src/main/services/clientService";
import { updateSettings } from "../../src/main/database/db";
import { assess, runCommand } from "../../src/main/services/commandService";
import { freshDb } from "../helpers";

describe("WhatsApp (links oficiais wa.me)", () => {
  it("normaliza números brasileiros", () => {
    expect(normalizeWhatsAppNumber("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsAppNumber("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsAppNumber("0055 11 3456-7890")).toBe("551134567890");
  });

  it("rejeita números inválidos", () => {
    expect(() => normalizeWhatsAppNumber("123")).toThrow();
    expect(() => normalizeWhatsAppNumber("abc")).toThrow();
  });

  it("codifica a mensagem na URL", () => {
    expect(buildWhatsAppUrl("11912345678", "Olá & bom dia?")).toBe("https://wa.me/5511912345678?text=Ol%C3%A1%20%26%20bom%20dia%3F");
  });
});

describe("GitHub", () => {
  it("converte remotes em URL navegável", () => {
    expect(remoteToGithubUrl("git@github.com:pedro/aquecedores.git")).toBe("https://github.com/pedro/aquecedores");
    expect(remoteToGithubUrl("https://github.com/pedro/aquecedores.git\n")).toBe("https://github.com/pedro/aquecedores");
    expect(remoteToGithubUrl("https://token@github.com/pedro/site")).toBe("https://github.com/pedro/site");
    expect(remoteToGithubUrl("https://gitlab.com/pedro/site.git")).toBeNull();
  });

  it("só aceita URLs do github.com", () => {
    expect(parseRepo("https://github.com/pedro/site")).toEqual({ owner: "pedro", repo: "site" });
    expect(() => parseRepo("https://github.com.evil.example/pedro/site")).toThrow();
    expect(() => parseRepo("https://github.com/pedro/../../user")).toThrow();
  });
});

describe("Google Calendar", () => {
  it("normaliza eventos de dia inteiro", () => {
    const ev = normalizeGoogleEvent({ id: "1", summary: "Feriado", start: { date: "2030-04-21" }, end: { date: "2030-04-22" } });
    expect(ev.startsAt).toBe("2030-04-21T00:00:00");
    expect(ev.endsAt).toBe("2030-04-21T23:59:59");
  });

  it("usa título padrão quando vazio", () => {
    expect(normalizeGoogleEvent({ id: "2", start: { dateTime: "2030-04-21T10:00:00Z" } }).title).toBe("(sem título)");
  });
});

describe("OAuth PKCE", () => {
  it("gera verifier e challenge base64url distintos", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("notificações", () => {
  beforeEach(() => freshDb());

  it("avisa tarefa com horário nos próximos 15 minutos, uma vez por chave", () => {
    const now = new Date(2030, 0, 10, 13, 50);
    tasks.createTask({ title: "Finalizar site", dueDate: localDate(now), dueTime: "14:00" });
    tasks.createTask({ title: "Mais tarde", dueDate: localDate(now), dueTime: "18:00" });
    const reminders = dueReminders(now);
    expect(reminders.map((r) => r.body)).toEqual(["14:00 · Finalizar site"]);
  });

  it("avisa reunião próxima, cobrança e respeita preferências", () => {
    const now = new Date(2030, 0, 10, 15, 50);
    calendar.createEvent({ title: "Reunião", startsAt: "2030-01-10T16:00:00" });
    clients.createClient({ name: "Aquecedores", monthlyValue: 39.99, nextBillingDate: "2030-01-10" });
    const titles = dueReminders(now).map((r) => r.title);
    expect(titles).toEqual(expect.arrayContaining(["Compromisso em breve", "Cobrança hoje"]));

    updateSettings({ notifications: { tasks: true, events: false, billing: false, marketing: true } });
    expect(dueReminders(now)).toHaveLength(0);
  });
});

describe("comandos sugeridos pela IA", () => {
  beforeEach(() => freshDb());

  it("recusa autorizar permanentemente um comando perigoso", async () => {
    await expect(runCommand({ command: "rm -rf /", cwd: "C:\\qualquer", decision: "always" })).rejects.toThrow();
    expect(assess("rm -rf /").alwaysAllowed).toBe(false);
  });

  it("recusa executar fora das pastas autorizadas", async () => {
    await expect(runCommand({ command: "git status", cwd: "C:\\Windows", decision: "once" })).rejects.toThrow(/Acesso negado/);
  });
});

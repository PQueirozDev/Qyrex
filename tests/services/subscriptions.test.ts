import { describe, expect, it } from "vitest";
import { cliArgs, createCodexParser, parseClaudeCodeLine, transcript } from "../../src/main/integrations/cli/subscriptions";

describe("assinatura: Claude Code", () => {
  it("roda sem nenhuma ferramenta, sem MCP, sem settings e sem salvar sessão", () => {
    const args = cliArgs("claude", "default", "sistema", "C:\\tmp");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--model");
    expect(cliArgs("claude", "haiku", "s", "C:\\tmp")).toEqual(expect.arrayContaining(["--model", "haiku"]));
  });

  it("lê texto, uso e erro do stream-json", () => {
    expect(parseClaudeCodeLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-haiku-4-5" }))).toEqual({ model: "claude-haiku-4-5" });
    expect(parseClaudeCodeLine(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "oi" } } }))).toEqual({
      delta: "oi",
    });
    // Pensamento do modelo não aparece na resposta.
    expect(parseClaudeCodeLine(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "x" } } }))).toEqual({});
    expect(
      parseClaudeCodeLine(JSON.stringify({ type: "stream_event", event: { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5 } } } }))
    ).toEqual({ usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 5, cacheWriteTokens: 0 } });
    expect(parseClaudeCodeLine(JSON.stringify({ type: "result", is_error: true, result: "Not logged in" }))).toEqual({ error: "Not logged in" });
    expect(parseClaudeCodeLine("lixo")).toEqual({});
  });
});

describe("assinatura: Codex", () => {
  it("desliga shell, apps, plugins e navegador e roda em sandbox só leitura", () => {
    const args = cliArgs("codex", "default", "s", "C:\\tmp");
    for (const f of ["shell_tool", "unified_exec", "apps", "plugins", "browser_use", "computer_use"]) {
      expect(args.join(" ")).toContain(`--disable ${f}`);
    }
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    expect(args.join(" ")).not.toMatch(/dangerously|full-access|workspace-write/);
  });

  it("entrega só o trecho novo de cada mensagem e o uso real", () => {
    const parse = createCodexParser();
    expect(parse(JSON.stringify({ type: "item.completed", item: { id: "i0", type: "error", message: "Code Mode..." } }))).toEqual({});
    expect(parse(JSON.stringify({ type: "item.updated", item: { id: "a", type: "agent_message", text: "Olá" } }))).toEqual({ delta: "Olá" });
    expect(parse(JSON.stringify({ type: "item.completed", item: { id: "a", type: "agent_message", text: "Olá mundo" } }))).toEqual({ delta: " mundo" });
    expect(parse(JSON.stringify({ type: "item.completed", item: { id: "b", type: "agent_message", text: "Segunda" } }))).toEqual({ delta: "\n\nSegunda" });
    expect(parse(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7 } }))).toEqual({
      usage: { inputTokens: 60, cacheReadTokens: 40, outputTokens: 7 },
    });
    expect(parse(JSON.stringify({ type: "turn.failed", error: { message: "limite" } }))).toEqual({ error: "limite" });
  });
});

describe("histórico em texto", () => {
  it("uma mensagem vai pura; várias viram transcrição com a última em destaque", () => {
    expect(transcript([{ role: "user", content: "oi" }])).toBe("oi");
    const t = transcript([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(t).toContain("[Usuário]\na");
    expect(t).toContain("[Assistente]\nb");
    expect(t.trim().endsWith("c")).toBe(true);
  });
});

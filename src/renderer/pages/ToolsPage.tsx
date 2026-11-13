import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Binary,
  Braces,
  CaseSensitive,
  Clock,
  Copy,
  Fingerprint,
  GitCompare,
  Hash,
  KeyRound,
  Link2,
  Palette,
  Regex,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, Segmented } from "@/components/ui/primitives";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { cn } from "@/lib/cn";
import { getLocale, tr, trn } from "@/lib/i18n";
import { toast } from "@/stores/useUIStore";
import {
  base64Decode,
  base64Encode,
  CASES,
  contrastRatio,
  decodeJwt,
  diffLines,
  formatJson,
  hashText,
  parseColor,
  parseTimestamp,
  slugify,
  sortJsonKeys,
  splitWords,
  toHex,
  toHsl,
  urlDecode,
  urlEncode,
  type CaseId,
  type HashAlgorithm,
} from "@/lib/devtools";

// --- Peças comuns -----------------------------------------------------------------------

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(tr("Copiado"));
  } catch {
    toast.error(tr("Não foi possível copiar."));
  }
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button size="xs" variant="ghost" onClick={() => void copy(text)} disabled={!text} title={tr("Copiar")} aria-label={tr("Copiar")}>
      <Copy size={12} />
    </Button>
  );
}

function Area({
  value,
  onChange,
  placeholder,
  readOnly,
  rows = 10,
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      className={cn("input resize-y font-mono text-[12.5px] leading-relaxed", readOnly && "bg-bg-elevated", className)}
      value={value}
      rows={rows}
      spellCheck={false}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

function Labeled({ label, actions, children }: { label: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-6 items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <p className="mt-1.5 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 font-mono text-xs text-danger">{message}</p>;
}

/** Guarda a entrada de cada ferramenta na sessão: trocar de ferramenta não apaga o que foi colado. */
const memory = new Map<string, string>();
function useMemoryState(key: string, initial = ""): [string, (v: string) => void] {
  const [value, setValue] = useState(() => memory.get(key) ?? initial);
  return [
    value,
    (v: string) => {
      memory.set(key, v);
      setValue(v);
    },
  ];
}

// --- Ferramentas ----------------------------------------------------------------------

function JsonTool() {
  const [input, setInput] = useMemoryState("json");
  const [indent, setIndent] = useState<"2" | "4" | "min">("2");
  const [sorted, setSorted] = useState(false);
  const result = useMemo(() => {
    if (!input.trim()) return null;
    const first = formatJson(input, indent === "min" ? "min" : Number(indent));
    if (!first.ok || !sorted) return first;
    return { ok: true as const, text: JSON.stringify(sortJsonKeys(JSON.parse(first.text)), null, indent === "min" ? undefined : Number(indent)) };
  }, [input, indent, sorted]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Labeled label={tr("Entrada")}>
        <Area value={input} onChange={setInput} rows={20} placeholder='{"nome": "Qyrex", "versao": 2}' />
      </Labeled>
      <Labeled
        label={tr("Resultado")}
        actions={
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <input type="checkbox" checked={sorted} onChange={(e) => setSorted(e.target.checked)} /> {tr("Ordenar chaves")}
            </label>
            <Segmented
              value={indent}
              onChange={setIndent}
              options={[
                { value: "2", label: "2" },
                { value: "4", label: "4" },
                { value: "min", label: tr("Minificar") },
              ]}
            />
            <CopyButton text={result?.ok ? result.text : ""} />
          </span>
        }
      >
        <Area value={result?.ok ? result.text : ""} readOnly rows={20} />
        {result && !result.ok && (
          <ErrorLine message={result.line ? tr("Linha {line}, coluna {column}: {error}", { line: result.line, column: result.column ?? "?", error: result.error }) : result.error} />
        )}
        {result?.ok && <p className="mt-1 text-[11px] text-success">{tr("JSON válido")}</p>}
      </Labeled>
    </div>
  );
}

function JwtTool() {
  const [token, setToken] = useMemoryState("jwt");
  const decoded = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ok: true as const, value: decodeJwt(token) };
    } catch (err) {
      return { ok: false as const, error: tr(err instanceof Error ? err.message : String(err)) };
    }
  }, [token]);
  const fmt = (ms: number) => new Date(ms).toLocaleString(getLocale());
  return (
    <div className="space-y-4">
      <Labeled label={tr("Token")}>
        <Area value={token} onChange={setToken} rows={4} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
      </Labeled>
      <p className="text-[11px] text-text-faint">{tr("Só decodifica: a assinatura não é verificada. O token não sai do seu PC.")}</p>
      {decoded && !decoded.ok && <ErrorLine message={decoded.error} />}
      {decoded?.ok && (
        <>
          {decoded.value.times.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {decoded.value.times.map((t) => (
                <Badge key={t.claim} tone={t.claim === "exp" ? (decoded.value.expired ? "danger" : "success") : "neutral"}>
                  {t.claim}: {fmt(t.ms)}
                </Badge>
              ))}
              {decoded.value.expired !== null && (
                <Badge tone={decoded.value.expired ? "danger" : "success"}>{decoded.value.expired ? tr("Expirado") : tr("Válido no tempo")}</Badge>
              )}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Labeled label={tr("Header")} actions={<CopyButton text={JSON.stringify(decoded.value.header, null, 2)} />}>
              <Area value={JSON.stringify(decoded.value.header, null, 2)} readOnly rows={8} />
            </Labeled>
            <Labeled label={tr("Payload")} actions={<CopyButton text={JSON.stringify(decoded.value.payload, null, 2)} />}>
              <Area value={JSON.stringify(decoded.value.payload, null, 2)} readOnly rows={8} />
            </Labeled>
          </div>
        </>
      )}
    </div>
  );
}

function EncodeTool({ kind }: { kind: "base64" | "url" }) {
  const [input, setInput] = useMemoryState(`enc-${kind}`);
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const output = useMemo(() => {
    if (!input) return { text: "", error: null };
    try {
      if (kind === "base64") return { text: mode === "encode" ? base64Encode(input, urlSafe) : base64Decode(input), error: null };
      return { text: mode === "encode" ? urlEncode(input) : urlDecode(input), error: null };
    } catch (err) {
      return { text: "", error: tr(err instanceof Error ? err.message : String(err)) };
    }
  }, [input, mode, urlSafe, kind]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "encode", label: tr("Codificar") },
            { value: "decode", label: tr("Decodificar") },
          ]}
        />
        {kind === "base64" && mode === "encode" && (
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} /> {tr("Seguro para URL")}
          </label>
        )}
        <Button size="xs" variant="ghost" onClick={() => (setInput(output.text), setMode(mode === "encode" ? "decode" : "encode"))} disabled={!output.text}>
          {tr("Inverter")}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Labeled label={tr("Entrada")}>
          <Area value={input} onChange={setInput} rows={12} />
        </Labeled>
        <Labeled label={tr("Resultado")} actions={<CopyButton text={output.text} />}>
          <Area value={output.text} readOnly rows={12} />
          {output.error && <ErrorLine message={output.error} />}
        </Labeled>
      </div>
    </div>
  );
}

function UuidTool() {
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(false);
  const [seed, setSeed] = useState(0);
  const ids = useMemo(() => {
    void seed; // muda a cada "Gerar"
    return Array.from({ length: count }, () => (upper ? crypto.randomUUID().toUpperCase() : crypto.randomUUID()));
  }, [count, upper, seed]);
  const text = ids.join("\n");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          {tr("Quantidade")}
          <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="input w-20 py-1" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> {tr("Maiúsculas")}
        </label>
        <Button size="sm" onClick={() => setSeed((s) => s + 1)}>
          {tr("Gerar")}
        </Button>
        <CopyButton text={text} />
      </div>
      <Area value={text} readOnly rows={Math.min(20, count + 1)} />
    </div>
  );
}

const HASHES: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

function HashTool() {
  const [input, setInput] = useMemoryState("hash");
  const [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(HASHES.map(async (a) => [a, await hashText(input, a)] as const)).then((list) => alive && setHashes(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
  }, [input]);
  return (
    <div className="space-y-4">
      <Labeled label={tr("Texto")}>
        <Area value={input} onChange={setInput} rows={6} />
      </Labeled>
      <div className="space-y-2">
        {HASHES.map((a) => (
          <div key={a} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-text-muted">{a}</span>
            <code className="min-w-0 flex-1 truncate rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 font-mono text-[11.5px] text-text">{hashes[a] ?? "…"}</code>
            <CopyButton text={hashes[a] ?? ""} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TimestampTool() {
  const [input, setInput] = useMemoryState("ts", String(Math.floor(Date.now() / 1000)));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = parseTimestamp(input);
  const rows: [string, string][] =
    ms === null
      ? []
      : [
          [tr("Data local"), new Date(ms).toLocaleString(getLocale(), { dateStyle: "full", timeStyle: "medium" })],
          ["ISO 8601 (UTC)", new Date(ms).toISOString()],
          [tr("Unix (segundos)"), String(Math.floor(ms / 1000))],
          [tr("Unix (milissegundos)"), String(ms)],
          [tr("Relativo"), new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(Math.round((ms - now) / 60_000), "minute")],
        ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Labeled label={tr("Timestamp ou data")}>
          <input className="input w-80 font-mono" value={input} onChange={(e) => setInput(e.target.value)} />
        </Labeled>
        <Button size="sm" variant="secondary" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>
          {tr("Agora")}
        </Button>
        <span className="pb-1.5 font-mono text-xs text-text-faint">
          {tr("agora")}: {Math.floor(now / 1000)}
        </span>
      </div>
      {ms === null ? (
        input.trim() && <ErrorLine message={tr("Não reconheci esse formato. Use segundos, milissegundos ou uma data ISO.")} />
      ) : (
        <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2">
              <span className="w-40 shrink-0 text-xs text-text-muted">{label}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{value}</code>
              <CopyButton text={value} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegexTool() {
  const [pattern, setPattern] = useMemoryState("re-pattern", "(\\w+)@(\\w+)\\.com");
  const [flags, setFlags] = useMemoryState("re-flags", "g");
  const [text, setText] = useMemoryState("re-text", "pedro@exemplo.com, time@qyrex.com");
  const result = useMemo(() => {
    if (!pattern) return null;
    try {
      const safeFlags = [...new Set(flags.replace(/[^dgimsuyv]/g, ""))].join("");
      const re = new RegExp(pattern, safeFlags.includes("g") ? safeFlags : safeFlags + "g");
      const matches = [...text.matchAll(re)].slice(0, 500);
      return { ok: true as const, matches };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [pattern, flags, text]);

  // Texto com os trechos encontrados destacados.
  const highlighted = useMemo(() => {
    if (!result?.ok || result.matches.length === 0) return [text];
    const parts: ReactNode[] = [];
    let last = 0;
    result.matches.forEach((m, i) => {
      const start = m.index ?? 0;
      if (m[0].length === 0) return;
      parts.push(text.slice(last, start));
      parts.push(
        <mark key={i} className="rounded-sm bg-accent/25 text-text">
          {m[0]}
        </mark>
      );
      last = start + m[0].length;
    });
    parts.push(text.slice(last));
    return parts;
  }, [result, text]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex flex-1 items-center rounded-md border border-border bg-bg font-mono text-sm focus-within:border-accent/60">
          <span className="pl-2.5 text-text-faint">/</span>
          <input className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-text focus:outline-none" value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} />
          <span className="text-text-faint">/</span>
          <input className="w-16 bg-transparent px-1 py-1.5 text-accent focus:outline-none" value={flags} onChange={(e) => setFlags(e.target.value)} aria-label={tr("Flags")} spellCheck={false} />
        </div>
      </div>
      {result && !result.ok && <ErrorLine message={result.error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Labeled label={tr("Texto de teste")}>
          <Area value={text} onChange={setText} rows={12} />
        </Labeled>
        <Labeled label={result?.ok ? trn(result.matches.length, "{n} resultado", "{n} resultados") : tr("Resultados")}>
          <div className="max-h-[300px] min-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg-elevated px-2.5 py-1.5 font-mono text-[12.5px] leading-relaxed text-text-muted">
            {highlighted}
          </div>
          {result?.ok && result.matches.some((m) => m.length > 1) && (
            <div className="mt-2 max-h-40 space-y-1 overflow-auto">
              {result.matches.slice(0, 50).map((m, i) => (
                <div key={i} className="flex flex-wrap gap-1 text-[11px]">
                  <span className="text-text-faint">#{i + 1}</span>
                  {m.slice(1).map((g, j) => (
                    <Badge key={j}>
                      ${j + 1}: {g ?? "∅"}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Labeled>
      </div>
    </div>
  );
}

function DiffTool() {
  const [a, setA] = useMemoryState("diff-a");
  const [b, setB] = useMemoryState("diff-b");
  const result = useMemo(() => {
    if (!a && !b) return null;
    try {
      return { ok: true as const, lines: diffLines(a, b) };
    } catch (err) {
      return { ok: false as const, error: tr(err instanceof Error ? err.message : String(err)) };
    }
  }, [a, b]);
  const added = result?.ok ? result.lines.filter((l) => l.kind === "add").length : 0;
  const removed = result?.ok ? result.lines.filter((l) => l.kind === "del").length : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Labeled label={tr("Original")}>
          <Area value={a} onChange={setA} rows={10} />
        </Labeled>
        <Labeled label={tr("Alterado")}>
          <Area value={b} onChange={setB} rows={10} />
        </Labeled>
      </div>
      {result && !result.ok && <ErrorLine message={result.error} />}
      {result?.ok && (
        <div>
          <p className="mb-1.5 text-xs text-text-muted">
            <span className="text-success">+{added}</span> <span className="text-danger">−{removed}</span>
            {added + removed === 0 && <span className="ml-2">{tr("Os textos são iguais.")}</span>}
          </p>
          <div className="max-h-[420px] overflow-auto rounded-md border border-border-subtle bg-bg-elevated font-mono text-[12px] leading-relaxed">
            {result.lines.map((l, i) => (
              <div
                key={i}
                className={cn("flex", l.kind === "add" && "bg-success/10 text-success", l.kind === "del" && "bg-danger/10 text-danger", l.kind === "same" && "text-text-muted")}
              >
                <span className="w-10 shrink-0 select-none pr-2 text-right text-text-faint/70">{l.a ?? ""}</span>
                <span className="w-10 shrink-0 select-none pr-2 text-right text-text-faint/70">{l.b ?? ""}</span>
                <span className="w-4 shrink-0 select-none">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                <span className="whitespace-pre-wrap break-all pr-3">{l.text || " "}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorTool() {
  const [input, setInput] = useMemoryState("color", "#ff9a3c");
  const color = parseColor(input);
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const formats: [string, string][] = color
    ? [
        ["HEX", toHex(color)],
        ["RGB", color.a < 1 ? `rgb(${color.r} ${color.g} ${color.b} / ${color.a})` : `rgb(${color.r} ${color.g} ${color.b})`],
        ["HSL", toHsl(color)],
        [tr("Tailwind (variável)"), `${color.r} ${color.g} ${color.b}`],
      ]
    : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Labeled label={tr("Cor")}>
          <input className="input w-64 font-mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="#ff9a3c, rgb(...), hsl(...)" />
        </Labeled>
        <input
          type="color"
          value={color ? toHex({ ...color, a: 1 }) : "#000000"}
          onChange={(e) => setInput(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
          aria-label={tr("Escolher cor")}
        />
      </div>
      {!color ? (
        input.trim() && <ErrorLine message={tr("Cor não reconhecida.")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <div className="h-36 rounded-lg border border-border-subtle" style={{ background: toHex(color) }} />
          <div className="space-y-3">
            <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {formats.map(([label, value]) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-36 shrink-0 text-xs text-text-muted">{label}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{value}</code>
                  <CopyButton text={value} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                [tr("sobre branco"), contrastRatio(color, white)],
                [tr("sobre preto"), contrastRatio(color, black)],
              ].map(([label, ratio]) => (
                <Badge key={label as string} tone={(ratio as number) >= 4.5 ? "success" : (ratio as number) >= 3 ? "warning" : "danger"}>
                  {tr("Contraste {label}: {ratio}", { label: label as string, ratio: (ratio as number).toFixed(2) })}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CASE_LABEL: Record<CaseId, string> = {
  camel: "camelCase",
  pascal: "PascalCase",
  snake: "snake_case",
  constant: "CONSTANT_CASE",
  kebab: "kebab-case",
  title: "Title Case",
};

function CaseTool() {
  const [input, setInput] = useMemoryState("case", "nova funcionalidade do runner");
  const words = splitWords(input);
  const rows: [string, string][] = [...(Object.keys(CASES) as CaseId[]).map((id): [string, string] => [CASE_LABEL[id], words.length ? CASES[id](words) : ""]), ["slug", slugify(input)]];
  return (
    <div className="space-y-4">
      <Labeled label={tr("Texto")}>
        <input className="input font-mono" value={input} onChange={(e) => setInput(e.target.value)} />
      </Labeled>
      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2">
            <span className="w-36 shrink-0 font-mono text-xs text-text-muted">{label}</span>
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{value}</code>
            <CopyButton text={value} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Página ---------------------------------------------------------------------------

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

const TOOLS: Tool[] = [
  { id: "json", name: tr("JSON"), description: tr("Formatar, minificar e validar"), icon: Braces, render: () => <JsonTool /> },
  { id: "jwt", name: tr("JWT"), description: tr("Decodificar header e payload"), icon: KeyRound, render: () => <JwtTool /> },
  { id: "base64", name: tr("Base64"), description: tr("Codificar e decodificar (UTF-8)"), icon: Binary, render: () => <EncodeTool kind="base64" /> },
  { id: "url", name: tr("URL"), description: tr("Codificar componentes de URL"), icon: Link2, render: () => <EncodeTool kind="url" /> },
  { id: "timestamp", name: tr("Timestamp"), description: tr("Unix ↔ data legível"), icon: Clock, render: () => <TimestampTool /> },
  { id: "regex", name: tr("Regex"), description: tr("Testar expressões regulares"), icon: Regex, render: () => <RegexTool /> },
  { id: "diff", name: tr("Comparar textos"), description: tr("Diferenças linha a linha"), icon: GitCompare, render: () => <DiffTool /> },
  { id: "uuid", name: tr("UUID"), description: tr("Gerar identificadores v4"), icon: Fingerprint, render: () => <UuidTool /> },
  { id: "hash", name: tr("Hash"), description: tr("SHA-1, SHA-256, SHA-512"), icon: Hash, render: () => <HashTool /> },
  { id: "color", name: tr("Cores"), description: tr("HEX, RGB, HSL e contraste"), icon: Palette, render: () => <ColorTool /> },
  { id: "case", name: tr("Maiúsculas e nomes"), description: tr("camelCase, snake_case, slug..."), icon: CaseSensitive, render: () => <CaseTool /> },
];

const TOOL_KEY = "qrz.tool";

export function ToolsPage() {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(TOOL_KEY) ?? "json";
    } catch {
      return "json";
    }
  });
  const [filter, setFilter] = useState("");
  const tool = TOOLS.find((t) => t.id === active) ?? TOOLS[0];
  const visible = TOOLS.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(filter.trim().toLowerCase()));

  const choose = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(TOOL_KEY, id);
    } catch {
      // sem storage: vale só nesta sessão
    }
  };

  return (
    <div>
      <PageHeader title={tr("Ferramentas")} icon={PAGE_ICONS.ferramentas} description={tr("Utilitários do dia a dia, offline. Nada do que você cola sai do PC.")} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-0.5">
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-2 py-1">
            <Search size={13} className="text-text-faint" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Filtrar...")} className="w-full bg-transparent text-xs text-text placeholder:text-text-faint focus:outline-none" />
          </div>
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => choose(t.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                t.id === tool.id ? "bg-bg-hover text-text" : "text-text-muted hover:bg-bg-hover/60 hover:text-text"
              )}
            >
              <t.icon size={15} className={t.id === tool.id ? "text-accent" : "text-text-faint"} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{t.name}</span>
                <span className="block truncate text-[11px] text-text-faint">{t.description}</span>
              </span>
            </button>
          ))}
        </nav>
        <section key={tool.id} className="min-w-0 animate-fade-in">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
            <tool.icon size={16} className="text-accent" /> {tool.name}
          </h2>
          {tool.render()}
        </section>
      </div>
    </div>
  );
}

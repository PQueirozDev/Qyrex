import { useEffect, useState } from "react";
import { CheckCircle2, FileCode2, TriangleAlert } from "lucide-react";
import type { EnvCheck } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { attempt } from "@/lib/api";
import { tr, trn } from "@/lib/i18n";
import { useUIStore } from "@/stores/useUIStore";

function KeyList({ keys, tone }: { keys: string[]; tone: "danger" | "warning" | "muted" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text-faint";
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keys.slice(0, 20).map((k) => (
        <code key={k} className={`rounded border border-border-subtle bg-bg-elevated px-1.5 py-px font-mono text-[10.5px] ${color}`}>
          {k}
        </code>
      ))}
      {keys.length > 20 && <span className="text-[11px] text-text-faint">+{keys.length - 20}</span>}
    </div>
  );
}

/**
 * Variáveis de ambiente do projeto: compara os .env com o .env.example.
 * Só aparece quando o projeto tem algum desses arquivos. Nunca mostra valores.
 */
export function EnvSection({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const [check, setCheck] = useState<EnvCheck | null>(null);
  const navigate = useUIStore((s) => s.navigate);

  useEffect(() => {
    void attempt(window.workspace.projects.envCheck(projectId)).then((c) => setCheck(c ?? null));
  }, [projectId]);

  if (!check || (!check.exampleFile && check.envFiles.length === 0)) return null;
  const sep = projectPath.includes("\\") ? "\\" : "/";
  const openFile = (name: string) => navigate("editor", `${projectPath}${sep}${name}`);
  const ok = check.exampleFile && check.envFiles.length > 0 && check.missing.length === 0;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="section-title">{tr("Variáveis de ambiente")}</p>
        <span className="flex gap-1">
          {[...check.envFiles, ...(check.exampleFile ? [check.exampleFile] : [])].map((f) => (
            <Button key={f} size="xs" variant="ghost" onClick={() => openFile(f)} title={tr("Abrir no editor")}>
              <FileCode2 size={11} /> {f}
            </Button>
          ))}
        </span>
      </div>
      <div className="space-y-2 text-xs">
        {!check.exampleFile ? (
          <p className="text-text-muted">
            {trn(check.defined, "{n} variável definida.", "{n} variáveis definidas.")} {tr("Sem .env.example para comparar: crie um para documentar o que o projeto precisa.")}
          </p>
        ) : check.envFiles.length === 0 ? (
          <p className="flex items-center gap-1.5 text-warning">
            <TriangleAlert size={13} /> {trn(check.expected, "O projeto pede {n} variável, mas não há nenhum .env.", "O projeto pede {n} variáveis, mas não há nenhum .env.")}
          </p>
        ) : ok ? (
          <p className="flex items-center gap-1.5 text-success">
            <CheckCircle2 size={13} /> {trn(check.expected, "A variável do {file} está definida.", "Todas as {n} variáveis do {file} estão definidas.", { file: check.exampleFile ?? "" })}
          </p>
        ) : (
          <div>
            <p className="flex items-center gap-1.5 text-danger">
              <TriangleAlert size={13} /> {trn(check.missing.length, "{n} variável do exemplo falta no .env:", "{n} variáveis do exemplo faltam no .env:")}
            </p>
            <KeyList keys={check.missing} tone="danger" />
          </div>
        )}
        {check.empty.length > 0 && (
          <div>
            <p className="text-warning">{trn(check.empty.length, "{n} variável está vazia:", "{n} variáveis estão vazias:")}</p>
            <KeyList keys={check.empty} tone="warning" />
          </div>
        )}
        {check.exampleFile && check.extra.length > 0 && (
          <div>
            <p className="text-text-faint">{trn(check.extra.length, "{n} variável não está no exemplo:", "{n} variáveis não estão no exemplo:")}</p>
            <KeyList keys={check.extra} tone="muted" />
          </div>
        )}
      </div>
    </section>
  );
}

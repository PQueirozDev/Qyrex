import { useEffect } from "react";
import { Activity } from "lucide-react";
import { runningCount, useRunnerStore } from "@/stores/useRunnerStore";
import { useUIStore } from "@/stores/useUIStore";
import { trn } from "@/lib/i18n";

/** Item da barra de status: quantos processos do runner estão rodando (some quando nenhum). */
export function RunnerStatus() {
  const navigate = useUIStore((s) => s.navigate);
  const { processes, init } = useRunnerStore();
  useEffect(() => init(), [init]);
  const running = runningCount(processes);
  const failed = processes.filter((p) => p.status === "failed").length;
  if (running === 0 && failed === 0) return null;
  return (
    <button className="status-item" onClick={() => navigate("processos")}>
      <span className="relative flex h-2 w-2">
        {running > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50" />}
        <span className={running > 0 ? "relative h-2 w-2 rounded-full bg-success" : "relative h-2 w-2 rounded-full bg-danger"} />
      </span>
      <Activity size={11} />
      {running > 0 ? trn(running, "{n} processo rodando", "{n} processos rodando") : trn(failed, "{n} processo falhou", "{n} processos falharam")}
    </button>
  );
}

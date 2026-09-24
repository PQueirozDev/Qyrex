import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Circle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAIStore } from "@/stores/useAIStore";
import type { AIProviderId } from "@shared/types";

const FUTURE_INTEGRATIONS = [
  { label: "GitHub", phase: "FASE 4" },
  { label: "Sincronização com Google Calendar", phase: "próxima iteração" },
  { label: "Spotify", phase: "FASE 4" },
  { label: "WhatsApp Business API", phase: "FASE 4" },
];

function StatusIcon({ connected, testing }: { connected: boolean; testing: boolean }) {
  if (testing) return <Loader2 size={14} className="animate-spin text-text-faint" />;
  return connected ? (
    <CheckCircle2 size={14} className="text-success" />
  ) : (
    <Circle size={14} className="text-text-faint" />
  );
}

export function Integrations() {
  const { providers, loadProviders, connectProvider, disconnectProvider, testProvider } = useAIStore();
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<AIProviderId | null>(null);
  const [testResult, setTestResult] = useState<{ id: AIProviderId; ok: boolean; error?: string } | null>(null);
  const [connecting, setConnecting] = useState<AIProviderId | null>(null);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  async function handleConnect(id: AIProviderId) {
    const key = keyInputs[id]?.trim();
    if (!key) return;
    setConnecting(id);
    const ok = await connectProvider(id, key);
    setConnecting(null);
    if (ok) setKeyInputs((prev) => ({ ...prev, [id]: "" }));
  }

  async function handleTest(id: AIProviderId) {
    setTesting(id);
    const result = await testProvider(id);
    setTesting(null);
    setTestResult({ id, ...result });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold text-text">Integrações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Providers de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.map((p) => (
            <div key={p.id} className="rounded-lg border border-border-subtle p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon connected={p.connected} testing={testing === p.id} />
                  <span className="text-sm font-medium text-text">{p.label}</span>
                </div>
                {p.connected && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => handleTest(p.id)}>
                      Testar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => disconnectProvider(p.id)}>
                      Desconectar
                    </Button>
                  </div>
                )}
              </div>

              {testResult?.id === p.id && (
                <p className={`mb-2 text-xs ${testResult.ok ? "text-success" : "text-danger"}`}>
                  {testResult.ok ? "Conexão funcionando." : testResult.error}
                </p>
              )}

              {!p.connected && (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInputs[p.id] ?? ""}
                    onChange={(e) => setKeyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="Cole sua API key"
                    className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <Button
                    size="sm"
                    disabled={!keyInputs[p.id]?.trim() || connecting === p.id}
                    onClick={() => handleConnect(p.id)}
                  >
                    {connecting === p.id ? "Conectando..." : "Conectar"}
                  </Button>
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-text-faint">
            As chaves são cifradas com o cofre de credenciais do sistema operacional e nunca ficam em
            texto puro em disco.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outras integrações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {FUTURE_INTEGRATIONS.map((i) => (
            <div key={i.label} className="flex items-center justify-between rounded-lg border border-border-subtle p-2.5">
              <div className="flex items-center gap-2">
                <XCircle size={14} className="text-text-faint" />
                <span className="text-sm text-text-muted">{i.label}</span>
              </div>
              <span className="text-xs text-text-faint">Disponível na {i.phase}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Code2, File, FilePlus, FolderOpen, FolderPlus, RefreshCw, RotateCcw, Save, X } from "lucide-react";
import type { DirEntry, EditableFile } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { EmptyState, Spinner } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { basename, dirname } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { applyQyrexTheme, languageForPath, languageLabel, monaco } from "@/lib/monaco";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { confirmAction, promptText, toast, useUIStore } from "@/stores/useUIStore";

/**
 * Editor de código embutido (Monaco, o motor do VS Code). Edita arquivos de
 * texto dentro das pastas autorizadas: árvore de arquivos, abas, Ctrl+S e
 * aviso quando o arquivo mudou fora do Qyrex. Para depurar, extensões e afins,
 * o botão "Abrir no VS Code" continua a um clique.
 */

interface Tab {
  path: string;
  name: string;
  language: string;
  /** mtime do disco na última leitura/gravação: o save compara para achar conflito. */
  mtimeMs: number;
  bom: boolean;
  /** `getAlternativeVersionId()` do model no último save (desfazer até ele = limpo). */
  savedVersion: number;
  dirty: boolean;
}

type DirState = DirEntry[] | "loading" | { error: string };

const STORAGE_KEY = "qrz.editor";
const keyOf = (p: string) => p.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
const samePath = (a: string, b: string) => keyOf(a) === keyOf(b);
const isInside = (root: string, p: string) => samePath(root, p) || keyOf(p).startsWith(`${keyOf(root)}\\`);

/**
 * Sessão do editor no localStorage. Abas com alteração não salva levam o texto
 * junto (`unsaved`) e o mtime em que foram editadas: fechar o app, recarregar a
 * janela (troca de idioma) ou atualizar não perde o que foi digitado, e o save
 * depois ainda detecta se o disco mudou nesse meio-tempo.
 */
interface SavedTab {
  path: string;
  unsaved?: string;
  mtimeMs?: number;
}

interface Saved {
  root: string | null;
  tabs: SavedTab[];
  active: string | null;
  /** Backups de arquivos que não reabriram (apagados, pasta desautorizada...): tentados de novo na próxima vez. */
  orphans: SavedTab[];
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    const valid = (t: SavedTab) => typeof t?.path === "string";
    return {
      root: typeof parsed.root === "string" ? parsed.root : null,
      tabs: parsed.tabs.filter(valid),
      active: typeof parsed.active === "string" ? parsed.active : null,
      orphans: Array.isArray(parsed.orphans) ? parsed.orphans.filter((t) => valid(t) && typeof t.unsaved === "string") : [],
    };
  } catch {
    return null;
  }
}

/**
 * Grava a sessão. Se a cota estourar (textos não salvos grandes demais), NÃO
 * sobrescreve: a última sessão gravada, com os backups, continua valendo.
 */
function persist(saved: Saved): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

/** `visible`: a página fica montada escondida em outras abas (ver App), para não perder edições. */
export function EditorPage({ visible = true }: { visible?: boolean }) {
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);
  const { projects, loaded, load } = useProjectsStore();
  const settings = useSettingsStore((s) => s.settings);

  const [root, setRoot] = useState<string | null>(null);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** Pasta onde "Novo arquivo/pasta" cria (a última pasta clicada na árvore). */
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const models = useRef(new Map<string, monaco.editor.ITextModel>());
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const tabsRef = useRef<Tab[]>([]);
  const activeRef = useRef<string | null>(null);
  const handledParam = useRef<string | null>(null);
  const saveActiveRef = useRef<() => void>(() => undefined);
  /** Saves em andamento (um por arquivo: Ctrl+S repetido não grava duas vezes em paralelo). */
  const savingPaths = useRef(new Set<string>());
  const rootRef = useRef<string | null>(null);
  const restoredRef = useRef(false);
  const persistTimer = useRef<number | undefined>(undefined);
  const orphansRef = useRef<SavedTab[]>([]);
  const quotaWarned = useRef(false);
  /** Fica true quando a sessão anterior terminou de reabrir (links e cliques esperam por ela). */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  /** Grava a sessão (com os textos não salvos) logo depois da última mudança. */
  function schedulePersist() {
    if (!restoredRef.current) return;
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(flushPersist, 400);
  }

  function flushPersist() {
    if (!restoredRef.current) return;
    window.clearTimeout(persistTimer.current);
    persistTimer.current = undefined;
    const ok = persist({
      root: rootRef.current,
      active: activeRef.current,
      tabs: tabsRef.current.map((t) =>
        t.dirty ? { path: t.path, unsaved: models.current.get(keyOf(t.path))?.getValue(), mtimeMs: t.mtimeMs } : { path: t.path }
      ),
      orphans: orphansRef.current,
    });
    if (!ok && !quotaWarned.current) {
      quotaWarned.current = true;
      toast.error(tr("Alterações não salvas grandes demais para o backup automático. Salve os arquivos para não perdê-las."));
    } else if (ok) quotaWarned.current = false;
  }
  const flushPersistRef = useRef(flushPersist);
  flushPersistRef.current = flushPersist;

  // Pastas possíveis: projetos + diretórios autorizados (+ a raiz atual, se veio de um link).
  const locations = useMemo(() => {
    const list = projects.map((p) => ({ value: p.localPath, label: p.name, group: tr("Projetos") }));
    for (const dir of settings?.allowedProjectDirs ?? []) list.push({ value: dir, label: dir, group: tr("Pastas autorizadas") });
    if (root && !list.some((l) => samePath(l.value, root))) list.unshift({ value: root, label: root, group: tr("Pasta aberta") });
    return list;
  }, [projects, settings?.allowedProjectDirs, root]);

  // --- Abas ------------------------------------------------------------------

  function commitTabs(next: Tab[]) {
    tabsRef.current = next;
    setTabs(next);
  }

  function updateTab(path: string, patch: Partial<Tab>) {
    commitTabs(tabsRef.current.map((t) => (samePath(t.path, path) ? { ...t, ...patch } : t)));
  }

  function activate(path: string | null) {
    const editor = editorRef.current;
    const current = activeRef.current;
    if (editor && current) viewStates.current.set(keyOf(current), editor.saveViewState());
    activeRef.current = path;
    setActive(path);
    if (!editor) return;
    const model = path ? models.current.get(keyOf(path)) ?? null : null;
    editor.setModel(model);
    if (path && model) {
      const view = viewStates.current.get(keyOf(path));
      if (view) editor.restoreViewState(view);
      editor.focus();
      void syncFromDisk(path);
    }
  }

  /** Arquivo limpo que mudou no disco (git checkout, outro editor...) é recarregado sozinho. */
  async function syncFromDisk(path: string) {
    const tab = tabsRef.current.find((t) => samePath(t.path, path));
    const model = models.current.get(keyOf(path));
    if (!tab || !model || tab.dirty) return;
    const res = await window.workspace.files.readForEdit(path);
    const now = tabsRef.current.find((t) => samePath(t.path, path));
    // Aba fechada/reaberta (outro model) ou editada durante a leitura: não mexe.
    if (!res.ok || !now || now.dirty || models.current.get(keyOf(path)) !== model || res.data.mtimeMs === now.mtimeMs) return;
    applyDiskVersion(path, model, res.data);
  }

  /** Troca o texto mantendo o histórico (Ctrl+Z volta para a versão anterior). */
  function replaceContent(model: monaco.editor.ITextModel, content: string) {
    model.pushStackElement();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
    model.pushStackElement();
  }

  /** Põe a versão do disco no model (texto + quebra de linha) e marca a aba como limpa. */
  function applyDiskVersion(path: string, model: monaco.editor.ITextModel, file: EditableFile) {
    replaceContent(model, file.content);
    model.setEOL(file.eol === "\r\n" ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
    updateTab(path, { mtimeMs: file.mtimeMs, bom: file.bom, savedVersion: model.getAlternativeVersionId(), dirty: false });
  }

  /** `backup`: texto não salvo da sessão anterior, reaplicado por cima do disco (fica como alteração pendente). */
  async function openFile(path: string, opts: { silent?: boolean; focus?: boolean; backup?: { content: string; mtimeMs: number } } = {}) {
    const reuse = (tab: Tab) => {
      // A aba já foi aberta (clique durante a restauração): o backup ainda vale se ela está limpa.
      const model = models.current.get(keyOf(tab.path));
      if (opts.backup && model && !tab.dirty && opts.backup.content !== model.getValue()) {
        updateTab(tab.path, { mtimeMs: opts.backup.mtimeMs });
        replaceContent(model, opts.backup.content);
      }
      if (opts.focus !== false) activate(tab.path);
    };
    const existing = tabsRef.current.find((t) => samePath(t.path, path));
    if (existing) return reuse(existing);
    let file;
    try {
      file = await unwrap(window.workspace.files.readForEdit(path));
    } catch (err) {
      if (opts.backup) {
        // O texto não é descartado: fica guardado e é tentado de novo na próxima abertura.
        orphansRef.current = [...orphansRef.current.filter((o) => !samePath(o.path, path)), { path, unsaved: opts.backup.content, mtimeMs: opts.backup.mtimeMs }];
        toast.error(
          tr("Não deu para reabrir \"{name}\" com as alterações não salvas ({error}). O texto ficou guardado e o Qyrex tenta de novo na próxima vez.", {
            name: basename(path),
            error: errorMessage(err),
          })
        );
      } else if (!opts.silent) toast.error(errorMessage(err));
      return;
    }
    if (opts.backup) orphansRef.current = orphansRef.current.filter((o) => !samePath(o.path, path));
    // Dois cliques rápidos: a primeira leitura já abriu a aba.
    const again = tabsRef.current.find((t) => samePath(t.path, file.path));
    if (again) return reuse(again);
    const uri = monaco.Uri.file(file.path);
    monaco.editor.getModel(uri)?.dispose();
    const language = languageForPath(file.path);
    const model = monaco.editor.createModel(file.content, language, uri);
    model.setEOL(file.eol === "\r\n" ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
    const key = keyOf(file.path);
    models.current.set(key, model);
    model.onDidChangeContent(() => {
      const tab = tabsRef.current.find((t) => keyOf(t.path) === key);
      if (!tab) return;
      const dirty = model.getAlternativeVersionId() !== tab.savedVersion;
      if (dirty !== tab.dirty) updateTab(tab.path, { dirty });
      schedulePersist();
    });
    commitTabs([
      ...tabsRef.current,
      {
        path: file.path,
        name: basename(file.path),
        language,
        mtimeMs: file.mtimeMs,
        bom: file.bom,
        savedVersion: model.getAlternativeVersionId(),
        dirty: false,
      },
    ]);
    if (opts.backup && opts.backup.content !== model.getValue()) {
      // mtime de quando o texto foi editado: se o disco mudou depois, o save avisa o conflito.
      updateTab(file.path, { mtimeMs: opts.backup.mtimeMs });
      replaceContent(model, opts.backup.content);
    }
    if (opts.focus !== false || !activeRef.current) activate(file.path);
  }

  async function closeTab(path: string) {
    const tab = tabsRef.current.find((t) => samePath(t.path, path));
    if (!tab) return;
    if (tab.dirty) {
      const ok = await confirmAction({
        title: tr("Descartar as alterações em \"{name}\"?", { name: tab.name }),
        description: tr("O que não foi salvo será perdido."),
        detail: tab.path,
        danger: true,
        confirmLabel: tr("Descartar"),
      });
      if (!ok) return;
    }
    const index = tabsRef.current.findIndex((t) => samePath(t.path, path));
    const rest = tabsRef.current.filter((t) => !samePath(t.path, path));
    if (activeRef.current && samePath(activeRef.current, path)) {
      activeRef.current = null; // não guarda o view state da aba que está saindo
      activate(rest[Math.min(index, rest.length - 1)]?.path ?? null);
    }
    commitTabs(rest);
    const key = keyOf(path);
    models.current.get(key)?.dispose();
    models.current.delete(key);
    viewStates.current.delete(key);
  }

  async function save(path: string, force = false): Promise<boolean> {
    const tab = tabsRef.current.find((t) => samePath(t.path, path));
    const model = models.current.get(keyOf(path));
    if (!tab || !model || savingPaths.current.has(keyOf(path))) return false;
    // Versão e texto capturados agora: o que for digitado durante o save continua pendente.
    const version = model.getAlternativeVersionId();
    const content = model.getValue();
    savingPaths.current.add(keyOf(path));
    setSaving(true);
    let res;
    try {
      res = await attempt(window.workspace.files.save({ path: tab.path, content, expectedMtimeMs: tab.mtimeMs, bom: tab.bom, force }));
    } finally {
      savingPaths.current.delete(keyOf(path));
      setSaving(savingPaths.current.size > 0);
    }
    // A aba foi fechada (e talvez reaberta com outro model) durante o save: nada a atualizar.
    if (!res || models.current.get(keyOf(path)) !== model) return false;
    if (res.status === "conflict") {
      const ok = await confirmAction({
        title: tr("\"{name}\" mudou fora do Qyrex", { name: tab.name }),
        description: tr("O arquivo foi alterado no disco depois que você o abriu. Salvar agora substitui a versão do disco pela sua."),
        detail: tab.path,
        danger: true,
        confirmLabel: tr("Sobrescrever"),
      });
      if (!ok) {
        toast.info(tr("Nada foi salvo. Use \"Recarregar do disco\" para ver a versão nova."));
        return false;
      }
      return models.current.get(keyOf(path)) === model ? save(path, true) : false;
    }
    updateTab(tab.path, { mtimeMs: res.mtimeMs, savedVersion: version, dirty: model.getAlternativeVersionId() !== version });
    return true;
  }

  async function reloadFromDisk(path: string) {
    const tab = tabsRef.current.find((t) => samePath(t.path, path));
    const model = models.current.get(keyOf(path));
    if (!tab || !model) return;
    if (tab.dirty) {
      const ok = await confirmAction({
        title: tr("Recarregar \"{name}\" do disco?", { name: tab.name }),
        description: tr("Suas alterações não salvas serão substituídas pela versão do disco (Ctrl+Z ainda desfaz)."),
        danger: true,
        confirmLabel: tr("Recarregar"),
      });
      if (!ok) return;
    }
    const version = model.getAlternativeVersionId();
    const file = await attempt(window.workspace.files.readForEdit(path));
    if (!file || models.current.get(keyOf(path)) !== model) return;
    // Digitou durante a leitura: não descarta o que acabou de escrever sem perguntar de novo.
    if (model.getAlternativeVersionId() !== version) {
      toast.info(tr("O arquivo foi editado durante o recarregamento. Tente de novo."));
      return;
    }
    applyDiskVersion(path, model, file);
  }

  saveActiveRef.current = () => {
    if (activeRef.current) void save(activeRef.current);
  };

  // --- Monaco ----------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;
    applyQyrexTheme();
    const editor = monaco.editor.create(containerRef.current, {
      model: null,
      theme: "qyrex",
      automaticLayout: true,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      minimap: { enabled: true, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      fixedOverflowWidgets: true,
      padding: { top: 8 },
    });
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActiveRef.current());
    const offCursor = editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }));

    // O tema do Qyrex pode mudar a qualquer momento (Configurações, tema do sistema).
    const observer = new MutationObserver(() => applyQyrexTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    // Recarregar/fechar a janela com um backup ainda no debounce: grava já.
    const onUnload = () => flushPersistRef.current();
    window.addEventListener("beforeunload", onUnload);

    const modelMap = models.current;
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      flushPersistRef.current();
      observer.disconnect();
      offCursor.dispose();
      editor.dispose();
      editorRef.current = null;
      for (const model of modelMap.values()) model.dispose();
      modelMap.clear();
    };
  }, []);

  // Voltar para a janela/página: confere se o arquivo aberto mudou no disco.
  useEffect(() => {
    if (!visible) return;
    // Escondido (display: none) o Monaco mediu 0×0: remede assim que voltar à tela.
    const frame = requestAnimationFrame(() => editorRef.current?.layout());
    if (activeRef.current) void syncFromDisk(activeRef.current);
    const onFocus = () => activeRef.current && void syncFromDisk(activeRef.current);
    // Ctrl+S com o foco fora do Monaco (árvore, abas) também salva.
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s" && !e.defaultPrevented) {
        e.preventDefault();
        saveActiveRef.current();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // --- Árvore ----------------------------------------------------------------

  async function loadDir(dir: string) {
    const key = keyOf(dir);
    // Ao atualizar, mantém a lista antiga na tela até a nova chegar.
    setDirs((d) => (Array.isArray(d[key]) ? d : { ...d, [key]: "loading" }));
    try {
      const list = await unwrap(window.workspace.files.list(dir));
      setDirs((d) => ({ ...d, [keyOf(dir)]: list }));
    } catch (err) {
      setDirs((d) => ({ ...d, [keyOf(dir)]: { error: errorMessage(err) } }));
    }
  }

  function changeRoot(next: string) {
    setRoot(next);
    setTargetDir(next);
    setExpanded(new Set());
    setDirs({});
    void loadDir(next);
  }

  function refreshTree() {
    if (!root) return;
    void loadDir(root);
    for (const k of expanded) {
      const p = findDirPath(k);
      if (p) void loadDir(p);
    }
  }

  /** Caminho original (com maiúsculas) de uma pasta já listada. */
  function findDirPath(key: string): string | null {
    for (const state of Object.values(dirs)) {
      if (!Array.isArray(state)) continue;
      const hit = state.find((e) => keyOf(e.path) === key);
      if (hit) return hit.path;
    }
    return root && keyOf(root) === key ? root : null;
  }

  function toggleDir(entry: DirEntry) {
    const key = keyOf(entry.path);
    setTargetDir(entry.path);
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      if (!Array.isArray(dirs[key])) void loadDir(entry.path);
    }
    setExpanded(next);
  }

  async function createEntry(kind: "file" | "folder") {
    const dir = targetDir ?? root;
    if (!dir) return;
    const name = await promptText({
      title: kind === "file" ? tr("Novo arquivo") : tr("Nova pasta"),
      label: tr("Nome (em {folder})", { folder: basename(dir) || dir }),
      placeholder: kind === "file" ? "index.ts" : "nova-pasta",
      confirmLabel: tr("Criar"),
    });
    if (!name) return;
    const created = await attempt(kind === "file" ? window.workspace.files.createFile(dir, name) : window.workspace.files.createFolder(dir, name));
    if (!created) return;
    await loadDir(dir);
    setExpanded((current) => new Set(current).add(keyOf(dir)));
    if (kind === "file") void openFile(created.path);
  }

  function renderDir(dir: string, depth: number) {
    const state = dirs[keyOf(dir)];
    if (state === undefined || state === "loading") {
      return (
        <div className="py-1 text-[11px] text-text-faint" style={{ paddingLeft: 12 + depth * 12 }}>
          {tr("Carregando...")}
        </div>
      );
    }
    if (!Array.isArray(state)) {
      return (
        <div className="py-1 text-[11px] text-danger" style={{ paddingLeft: 12 + depth * 12 }}>
          {state.error}
        </div>
      );
    }
    if (state.length === 0 && depth > 0) {
      return (
        <div className="py-1 text-[11px] text-text-faint" style={{ paddingLeft: 12 + depth * 12 }}>
          {tr("Pasta vazia")}
        </div>
      );
    }
    return state.map((entry) => {
      const key = keyOf(entry.path);
      const open = expanded.has(key);
      const isActive = active !== null && samePath(active, entry.path);
      return (
        <div key={key}>
          <button
            onClick={() => (entry.isDirectory ? toggleDir(entry) : void openFile(entry.path))}
            title={entry.path}
            className={cn(
              "flex w-full items-center gap-1.5 truncate py-[3px] pr-2 text-left text-[12.5px] transition-colors hover:bg-bg-hover/60",
              isActive ? "bg-accent/10 text-text" : "text-text-muted",
              entry.isDirectory && targetDir !== null && samePath(targetDir, entry.path) && "text-text"
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {entry.isDirectory ? (
              <>
                {open ? <ChevronDown size={12} className="shrink-0 text-text-faint" /> : <ChevronRight size={12} className="shrink-0 text-text-faint" />}
                <FolderOpen size={13} className="shrink-0 text-accent" />
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <File size={13} className="shrink-0 text-text-faint" />
              </>
            )}
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.isDirectory && open && renderDir(entry.path, depth + 1)}
        </div>
      );
    });
  }

  // --- Abertura: estado salvo e links (pageParam) -----------------------------

  // Restaura a pasta e as abas da última sessão (uma vez, quando a página monta).
  useEffect(() => {
    if (restored || !settings) return;
    setRestored(true);
    const saved = loadSaved();
    if (saved?.root) changeRoot(saved.root);
    void (async () => {
      // Abas da sessão + backups que não reabriram da última vez (quem falhar de novo volta para os órfãos).
      const tabsToOpen = [...(saved?.tabs ?? []), ...(saved?.orphans ?? []).filter((o) => !saved?.tabs.some((t) => samePath(t.path, o.path)))];
      for (const t of tabsToOpen) {
        const backup = typeof t.unsaved === "string" && typeof t.mtimeMs === "number" ? { content: t.unsaved, mtimeMs: t.mtimeMs } : undefined;
        await openFile(t.path, { silent: true, focus: false, backup });
      }
      const target = saved?.active && tabsRef.current.find((t) => samePath(t.path, saved.active!));
      if (target) activate(target.path);
      // Só agora a sessão pode ser regravada (antes, um save parcial apagaria os backups).
      restoredRef.current = true;
      schedulePersist();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, restored]);

  // Sem pasta escolhida: começa no primeiro projeto/pasta autorizada.
  useEffect(() => {
    if (restored && !root && locations.length > 0 && !pageParam) changeRoot(locations[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, root, locations, pageParam]);

  useEffect(() => {
    rootRef.current = root;
    schedulePersist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, tabs, active]);

  // `pageParam` = caminho de uma pasta (vira a raiz) ou de um arquivo (abre numa aba).
  useEffect(() => {
    if (!visible || !ready) return;
    if (!pageParam) {
      handledParam.current = null;
      return;
    }
    if (handledParam.current === pageParam) return;
    handledParam.current = pageParam;
    const target = pageParam;
    void (async () => {
      const listing = await window.workspace.files.list(target);
      if (listing.ok) {
        changeRoot(target);
      } else {
        if (!root || !isInside(root, target)) {
          const project = projects.find((p) => isInside(p.localPath, target));
          changeRoot(project?.localPath ?? dirname(target));
        }
        await openFile(target);
      }
      navigate("editor");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParam, visible, ready]);

  // --- Render ----------------------------------------------------------------

  const activeTab = tabs.find((t) => active !== null && samePath(t.path, active)) ?? null;
  const dirtyCount = tabs.filter((t) => t.dirty).length;
  const PageIcon = PAGE_ICONS.editor;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
        <PageIcon size={15} className="text-accent" />
        <span className="text-sm font-medium text-text">{tr("Editor")}</span>
        <select className="input ml-2 w-60 py-1 text-xs" value={root ?? ""} onChange={(e) => e.target.value && changeRoot(e.target.value)}>
          {locations.length === 0 && <option value="">{tr("Nenhuma pasta autorizada")}</option>}
          {[...new Set(locations.map((l) => l.group))].map((group) => (
            <optgroup key={group} label={group}>
              {locations
                .filter((l) => l.group === group)
                .map((l) => (
                  <option key={`${group}-${l.value}`} value={l.value}>
                    {l.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          {dirtyCount > 0 && <span className="text-[11px] text-warning">{trn(dirtyCount, "{n} arquivo não salvo", "{n} arquivos não salvos")}</span>}
          <Button size="sm" variant="secondary" onClick={() => activeTab && void save(activeTab.path)} disabled={!activeTab?.dirty} loading={saving} title={tr("Salvar (Ctrl+S)")}>
            <Save size={13} />{" "}{tr("Salvar")}</Button>
          <Button size="sm" variant="ghost" onClick={() => activeTab && void reloadFromDisk(activeTab.path)} disabled={!activeTab} title={tr("Recarregar do disco")}>
            <RotateCcw size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (activeTab ?? root) && void attempt(window.workspace.system.openVSCode(root ?? activeTab!.path))}
            disabled={!root && !activeTab}
            title={tr("Abrir a pasta no VS Code")}
          >
            <Code2 size={13} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Árvore de arquivos */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-bg">
          <div className="flex items-center gap-1 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-text-faint" title={root ?? undefined}>
              {root ? basename(root) || root : tr("Arquivos")}
            </span>
            <button onClick={() => void createEntry("file")} disabled={!root} className="rounded p-1 text-text-faint hover:bg-bg-hover hover:text-text disabled:opacity-40" title={tr("Novo arquivo")} aria-label={tr("Novo arquivo")}>
              <FilePlus size={13} />
            </button>
            <button onClick={() => void createEntry("folder")} disabled={!root} className="rounded p-1 text-text-faint hover:bg-bg-hover hover:text-text disabled:opacity-40" title={tr("Nova pasta")} aria-label={tr("Nova pasta")}>
              <FolderPlus size={13} />
            </button>
            <button onClick={refreshTree} disabled={!root} className="rounded p-1 text-text-faint hover:bg-bg-hover hover:text-text disabled:opacity-40" title={tr("Atualizar")} aria-label={tr("Atualizar")}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {root ? (
              renderDir(root, 0)
            ) : (
              <p className="px-3 py-2 text-xs text-text-faint">{tr("Escolha um projeto ou pasta autorizada.")}</p>
            )}
          </div>
        </aside>

        {/* Abas + editor */}
        <section className="flex min-w-0 flex-1 flex-col">
          {tabs.length > 0 && (
            <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border-subtle bg-bg px-2 py-1">
              {tabs.map((t) => {
                const isActive = active !== null && samePath(t.path, active);
                return (
                  <div
                    key={keyOf(t.path)}
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        void closeTab(t.path);
                      }
                    }}
                    className={cn(
                      "group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                      isActive ? "bg-bg-hover text-text" : "text-text-muted hover:bg-bg-hover/60"
                    )}
                  >
                    <button onClick={() => activate(t.path)} title={t.path} className="max-w-[200px] truncate">
                      {t.name}
                    </button>
                    <button
                      onClick={() => void closeTab(t.path)}
                      className="relative flex h-4 w-4 items-center justify-center rounded text-text-faint hover:text-text"
                      aria-label={t.dirty ? tr("Fechar (não salvo)") : tr("Fechar")}
                      title={t.dirty ? tr("Não salvo") : undefined}
                    >
                      {t.dirty ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-text-muted group-hover:hidden" />
                          <X size={11} className="hidden group-hover:block" />
                        </>
                      ) : (
                        <X size={11} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            {/* O Monaco fica sempre montado; sem abas, o estado vazio cobre ele. */}
            <div ref={containerRef} className="absolute inset-0" />
            {tabs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated">
                {!settings ? (
                  <Spinner />
                ) : locations.length === 0 ? (
                  <EmptyState
                    icon={PageIcon}
                    title={tr("Nenhuma pasta autorizada")}
                    description={tr("Autorize uma pasta em Configurações para editar os arquivos dela.")}
                    action={
                      <Button size="sm" variant="secondary" onClick={() => navigate("configuracoes")}>{tr("Abrir Configurações")}</Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={PageIcon}
                    title={tr("Nenhum arquivo aberto")}
                    description={tr("Escolha um arquivo na árvore ao lado. Ctrl+S salva; F1 abre os comandos do editor.")}
                  />
                )}
              </div>
            )}
          </div>

          {activeTab && (
            <div className="flex shrink-0 items-center gap-4 border-t border-border-subtle bg-bg px-3 py-1 text-[11px] text-text-faint">
              <span className="min-w-0 flex-1 truncate" title={activeTab.path}>
                {root && isInside(root, activeTab.path) ? activeTab.path.slice(root.replace(/[\\/]+$/, "").length + 1) : activeTab.path}
              </span>
              <span>{tr("Ln {line}, Col {column}", { line: String(cursor.line), column: String(cursor.column) })}</span>
              <span>{models.current.get(keyOf(activeTab.path))?.getEOL() === "\r\n" ? "CRLF" : "LF"}</span>
              <span>{activeTab.bom ? "UTF-8 BOM" : "UTF-8"}</span>
              <span>{languageLabel(activeTab.language)}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

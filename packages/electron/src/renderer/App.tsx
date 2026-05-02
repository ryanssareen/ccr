import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "./state/session-store.js";
import { ccrIpcClient } from "./ipc-client.js";
import { theme, type DesktopMode } from "./theme.js";
import { SessionRail } from "./components/SessionRail.js";
import { ChatStage } from "./components/ChatStage.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { CommandBar } from "./components/CommandBar.js";

const SLASH_COMMANDS = [
  { label: "/clear", shortcut: "/clear" },
  { label: "/save", shortcut: "/save" },
  { label: "/sessions", shortcut: "/sessions" },
  { label: "/exit", shortcut: "/exit" },
] as const;

export function App() {
  const auth = useSessionStore((s) => s.auth);
  const config = useSessionStore((s) => s.config);
  const indexed = useSessionStore((s) => s.indexed);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const defaultProjectRoot = useSessionStore((s) => s.bootstrapDefaultProjectRoot);
  const quota = useSessionStore((s) => s.quota);
  const setQuota = useSessionStore((s) => s.setQuota);
  const hydrateBootstrap = useSessionStore((s) => s.hydrateBootstrap);
  const subscribeSessionWatcher = useSessionStore((s) => s.subscribeSessionWatcher);
  const selectSessionPath = useSessionStore((s) => s.selectSessionPath);

  const [model, setModel] = useState<string>(config?.model ?? "llama-3.3-70b-versatile");
  const [mode, setMode] = useState<DesktopMode>("ask");
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);

  // Initial hydration + watcher subscription.
  useEffect(() => {
    void hydrateBootstrap();
    const unsub = subscribeSessionWatcher();
    return () => {
      unsub?.();
    };
  }, [hydrateBootstrap, subscribeSessionWatcher]);

  // Adopt persisted model once config arrives. User overrides after stand.
  useEffect(() => {
    if (config?.model && config.model !== model) setModel(config.model);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.model]);

  // Persist quota updates pushed from the agent stream into the store.
  useEffect(() => {
    return ccrIpcClient.subscribeAgentQuota((payload) => {
      setQuota({
        used: payload.used,
        limit: payload.limit,
        resetAt: new Date(payload.resetAt),
      });
    });
  }, [setQuota]);

  // ⌘K / Ctrl K opens the command palette; Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (e.key === "Escape" && cmdOpen) {
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cmdOpen]);

  const projectRoots = useMemo(() => {
    const set = new Set<string>();
    if (defaultProjectRoot) set.add(defaultProjectRoot);
    for (const s of indexed) if (s.projectRoot) set.add(s.projectRoot);
    return [...set];
  }, [defaultProjectRoot, indexed]);

  const handleNewSession = async (projectRoot: string) => {
    const { sessionPath } = await ccrIpcClient.createSession({ projectRoot });
    await selectSessionPath(sessionPath);
  };

  const slashActions = useMemo(
    () =>
      SLASH_COMMANDS.map((sc) => ({
        ...sc,
        run: () => setCmdOpen(false),
      })),
    [],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gridTemplateRows: "1fr auto",
        gridTemplateAreas: `
          "sessions chat"
          "settings chat"
        `,
        height: "100vh",
        width: "100vw",
        background: theme.borderDim,
        color: theme.text,
        fontFamily: '"JetBrains Mono", "SF Mono", monospace',
      }}
    >
      <SessionRail
        indexed={indexed}
        activeSessionPath={activeSessionPath}
        onSelect={selectSessionPath}
        onNewSession={handleNewSession}
        defaultProjectRoot={defaultProjectRoot}
      />

      <div style={{ gridArea: "chat", overflow: "hidden", borderLeft: `1px solid ${theme.border}` }}>
        <ChatStage
          mode={mode}
          model={model}
          onQuotaPush={() => {
            // ChatStage forwards proxy-side quota pushes; we subscribe
            // globally above, so this is a no-op pass-through.
          }}
        />
      </div>

      <div
        style={{
          gridArea: "settings",
          borderTop: `1px solid ${theme.border}`,
          borderRight: `1px solid ${theme.border}`,
        }}
      >
        <SettingsPanel
          auth={auth ? { email: auth.email } : null}
          model={model}
          mode={mode}
          quota={quota}
          customModelDraft={customModelDraft}
          onPickModel={(m) => {
            setModel(m);
            void ccrIpcClient.saveSettings({ model: m });
          }}
          onCustomDraft={setCustomModelDraft}
          onModePick={setMode}
        />
      </div>

      <CommandBar
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        indexed={indexed}
        models={[]}
        modes={["ask", "accept-edits", "bypass"]}
        slashActions={slashActions}
        projectRoots={projectRoots}
        onSelectSessionPath={(p) => {
          setCmdOpen(false);
          void selectSessionPath(p);
        }}
        onNewSession={async (root) => {
          setCmdOpen(false);
          await handleNewSession(root);
        }}
        onSetModel={(m) => {
          setCmdOpen(false);
          setModel(m);
          void ccrIpcClient.saveSettings({ model: m });
        }}
        onSetMode={(m) => {
          setCmdOpen(false);
          setMode(m);
        }}
      />
    </div>
  );
}

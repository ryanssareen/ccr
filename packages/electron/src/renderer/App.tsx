import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "./state/session-store.js";
import { ccrIpcClient } from "./ipc-client.js";
import { theme, type DesktopMode } from "./theme.js";
import { SessionRail } from "./components/SessionRail.js";
import { ChatStage } from "./components/ChatStage.js";
import { ProfileFooter } from "./components/ProfileFooter.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { CommandBar } from "./components/CommandBar.js";
import { signOutFirebase } from "./firebase-client.js";

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
  const firebaseConfig = useSessionStore((s) => s.firebaseConfig);
  const setQuota = useSessionStore((s) => s.setQuota);
  const hydrateBootstrap = useSessionStore((s) => s.hydrateBootstrap);
  const subscribeSessionWatcher = useSessionStore((s) => s.subscribeSessionWatcher);
  const selectSessionPath = useSessionStore((s) => s.selectSessionPath);
  const deleteSession = useSessionStore((s) => s.deleteSession);

  const [model, setModel] = useState<string>(config?.model ?? "llama-3.3-70b-versatile");
  const [mode, setMode] = useState<DesktopMode>("ask");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    void hydrateBootstrap().finally(() => setBootstrapped(true));
    const unsub = subscribeSessionWatcher();
    return () => {
      unsub?.();
    };
  }, [hydrateBootstrap, subscribeSessionWatcher]);

  useEffect(() => {
    if (config?.model && config.model !== model) setModel(config.model);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.model]);

  useEffect(() => {
    return ccrIpcClient.subscribeAgentQuota((payload) => {
      setQuota({
        used: payload.used,
        limit: payload.limit,
        resetAt: new Date(payload.resetAt),
      });
    });
  }, [setQuota]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (cmdOpen) setCmdOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cmdOpen, settingsOpen]);

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

  const handlePickModel = (m: string) => {
    setModel(m);
    void ccrIpcClient.saveSettings({ model: m });
  };

  const handleSignOut = async () => {
    // Close the modal immediately so the click feels responsive even if
    // the IPC roundtrip / firebase signOut takes a moment.
    setSettingsOpen(false);
    try {
      await signOutFirebase();
    } catch {
      // best-effort
    }
    try {
      await ccrIpcClient.clearAuth();
    } catch (err) {
      window.alert(`Sign out failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await hydrateBootstrap();
  };

  // Loading splash while bootstrap resolves so we don't flash login.
  if (!bootstrapped) {
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: theme.bg,
          color: theme.textMute,
          fontFamily: "var(--font-sans)",
          fontSize: 13,
        }}
      >
        <span>Loading…</span>
      </div>
    );
  }

  // Show login if not authenticated and we have firebase config to drive it.
  if (!auth) {
    if (firebaseConfig && firebaseConfig.apiKey) {
      return <LoginScreen firebaseConfig={firebaseConfig} />;
    }
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: theme.bg,
          color: theme.text,
          padding: 32,
          textAlign: "center",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, margin: "0 0 12px" }}>
            Sign in to ccr
          </h1>
          <p style={{ color: theme.textDim, fontSize: 14, lineHeight: 1.5 }}>
            This build can't find Firebase auth credentials. Save your project's
            web config (Firebase Console → Project settings → Your apps → SDK
            setup → Config) to{" "}
            <code className="mono">~/.ccr/firebase.json</code> as JSON with{" "}
            <code className="mono">apiKey</code>,{" "}
            <code className="mono">authDomain</code>,{" "}
            <code className="mono">projectId</code>, and{" "}
            <code className="mono">appId</code>, then restart the app.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: theme.bgAlt2,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: theme.text,
              textAlign: "left",
              whiteSpace: "pre-wrap",
            }}
          >{`{
  "apiKey": "AIza…",
  "authDomain": "ccr-managed.firebaseapp.com",
  "projectId": "ccr-managed",
  "appId": "1:…:web:…"
}`}</pre>
          <p style={{ color: theme.textMute, fontSize: 12, marginTop: 12 }}>
            (Or set the same values as <code className="mono">CCR_FIREBASE_*</code>{" "}
            env vars before launching.)
          </p>
        </div>
      </div>
    );
  }

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
        background: theme.bg,
        color: theme.text,
        fontFamily: "var(--font-sans)",
      }}
    >
      <SessionRail
        indexed={indexed}
        activeSessionPath={activeSessionPath}
        onSelect={selectSessionPath}
        onNewSession={handleNewSession}
        onDeleteSession={async (p) => {
          const r = await deleteSession(p);
          if (!r.ok) window.alert(r.error ?? "Delete failed.");
        }}
        defaultProjectRoot={defaultProjectRoot}
      />

      <ChatStage
        mode={mode}
        model={model}
        onPickModel={handlePickModel}
        onQuotaPush={() => {
          // ChatStage forwards proxy-side quota pushes; we subscribe globally.
        }}
      />

      <ProfileFooter
        auth={auth}
        config={config}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {settingsOpen && (
        <SettingsModal
          config={config ?? {}}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => void handleSignOut()}
        />
      )}

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
          handlePickModel(m);
        }}
        onSetMode={(m) => {
          setCmdOpen(false);
          setMode(m);
        }}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "./state/session-store.js";
import { ccrIpcClient } from "./ipc-client.js";
import { theme, type DesktopMode } from "./theme.js";
import { SessionRail } from "./components/SessionRail.js";
import { ChatStage } from "./components/ChatStage.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { CommandBar } from "./components/CommandBar.js";
import { Toast, UpdateBanner } from "./components/ui.js";
import { KNOWN_MODELS } from "./known-models.js";
import { signOutFirebase } from "./firebase-client.js";
import type { UpdateCheckResult } from "../common/ipc.js";

const SLASH_COMMANDS = [
  { label: "/clear", shortcut: "/clear" },
  { label: "/save", shortcut: "/save" },
  { label: "/sessions", shortcut: "/sessions" },
  { label: "/exit", shortcut: "/exit" },
] as const;

export function App() {
  const auth = useSessionStore((s) => s.auth);
  const config = useSessionStore((s) => s.config);
  const quota = useSessionStore((s) => s.quota);
  const appVersion = useSessionStore((s) => s.appVersion);
  const indexed = useSessionStore((s) => s.indexed);
  const activeSessionPath = useSessionStore((s) => s.activeSessionPath);
  const defaultProjectRoot = useSessionStore((s) => s.bootstrapDefaultProjectRoot);
  const needsProjectRootChoice = useSessionStore((s) => s.needsProjectRootChoice);
  const pickProjectRoot = useSessionStore((s) => s.pickProjectRoot);
  const dismissProjectRootPrompt = useSessionStore((s) => s.dismissProjectRootPrompt);
  const defaultModel = useSessionStore((s) => s.bootstrapDefaultModel);
  const firebaseConfig = useSessionStore((s) => s.firebaseConfig);
  const setQuota = useSessionStore((s) => s.setQuota);
  const hydrateBootstrap = useSessionStore((s) => s.hydrateBootstrap);
  const subscribeSessionWatcher = useSessionStore((s) => s.subscribeSessionWatcher);
  const selectSessionPath = useSessionStore((s) => s.selectSessionPath);
  const deleteSession = useSessionStore((s) => s.deleteSession);

  const [model, setModel] = useState<string>("");
  const [mode, setMode] = useState<DesktopMode>("ask");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    void hydrateBootstrap().finally(() => setBootstrapped(true));
    const unsub = subscribeSessionWatcher();
    return () => {
      unsub?.();
    };
  }, [hydrateBootstrap, subscribeSessionWatcher]);

  // An explicit config.model wins; otherwise fall back to core's
  // DEFAULT_MODEL, which rides in on the bootstrap payload. Both are empty on
  // the first render because bootstrap is async, so this must resolve in an
  // effect — a useState initializer would freeze the pre-bootstrap value and
  // never see either. Keep it as ONE effect: two effects each calling setModel
  // would both fire on the commit where bootstrap lands, and the last writer
  // would win, silently overriding an explicit config.model.
  useEffect(() => {
    const next = config?.model || defaultModel;
    if (next && next !== model) setModel(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.model, defaultModel]);

  useEffect(() => {
    return ccrIpcClient.subscribeAgentQuota((payload) => {
      setQuota({
        used: payload.used,
        limit: payload.limit,
        resetAt: new Date(payload.resetAt),
      });
    });
  }, [setQuota]);

  // Check for a newer desktop release once we're booted and signed in. Silent
  // on failure — an offline launch shouldn't surface anything.
  useEffect(() => {
    if (!bootstrapped || !auth) return;
    let cancelled = false;
    void ccrIpcClient.checkForUpdate().then((r) => {
      if (!cancelled) setUpdate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, auth]);

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

  // A rejected pick is worth surfacing (the user chose something unusable and
  // would otherwise see nothing happen); a cancel is not.
  const handlePickProjectRoot = async () => {
    const result = await pickProjectRoot();
    if (!result.ok && !result.canceled) window.alert(result.error);
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
    showToast("Signed out");
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

  const showUpdateBanner = !!update?.ok && !!update.updateAvailable && !updateDismissed;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: theme.bg,
        color: theme.text,
        fontFamily: "var(--font-sans)",
      }}
    >
      {showUpdateBanner && (
        <UpdateBanner
          version={update?.latest ?? ""}
          onDownload={() => {
            if (update?.releaseUrl) void ccrIpcClient.openExternal(update.releaseUrl);
          }}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `${sidebarCollapsed ? 72 : 272}px 1fr`,
          gridTemplateRows: "1fr",
          width: "100%",
          overflow: "hidden",
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
        onPickProjectRoot={handlePickProjectRoot}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        query={query}
        onQueryChange={setQuery}
        auth={auth}
        config={config}
        quota={quota}
        onOpenSettings={() => setSettingsOpen(true)}
        onToast={showToast}
      />

      {needsProjectRootChoice && (
        <ProjectRootPrompt
          currentRoot={defaultProjectRoot}
          onChoose={handlePickProjectRoot}
          onDismiss={dismissProjectRootPrompt}
        />
      )}

      <ChatStage
        mode={mode}
        model={model}
        onPickModel={handlePickModel}
        onSetMode={setMode}
        onOpenCommandBar={() => setCmdOpen(true)}
        onToast={showToast}
        onQuotaPush={() => {
          // ChatStage forwards proxy-side quota pushes; we subscribe globally.
        }}
      />

      {settingsOpen && (
        <SettingsModal
          config={config ?? {}}
          quota={quota}
          appVersion={appVersion}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => void handleSignOut()}
          onToast={showToast}
        />
      )}

      {toast && <Toast text={toast} />}

      <CommandBar
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        indexed={indexed}
        models={KNOWN_MODELS}
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
          showToast("New session started");
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
    </div>
  );
}

/**
 * First-run project-folder prompt (issue #21).
 *
 * Only the packaged app reaches this: a Finder launch has no meaningful cwd,
 * so the root falls back to $HOME — safe, but nobody's project. Rather than
 * silently rooting the agent's file tools at the home folder, ask once.
 *
 * Dismissable, not modal-locked: $HOME is a legitimate answer, and the rail's
 * "Change" button is always there for later.
 */
function ProjectRootPrompt(props: {
  currentRoot: string;
  onChoose: () => Promise<void> | void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a project folder"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <div
        style={{
          width: 460,
          maxWidth: "calc(100vw - 48px)",
          background: theme.bgAlt,
          border: `1px solid ${theme.borderSoft}`,
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: theme.text }}>
          Choose a project folder
        </h2>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            lineHeight: 1.55,
            color: theme.textDim,
          }}
        >
          ccr needs to know which folder to work in. Until you pick one, new
          sessions run in your home folder:
        </p>
        <div
          style={{
            margin: "10px 0 18px",
            padding: "7px 10px",
            borderRadius: 6,
            background: theme.bg,
            border: `1px solid ${theme.borderSoft}`,
            color: theme.textMute,
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={props.currentRoot}
        >
          {props.currentRoot}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={props.onDismiss}
            style={{
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${theme.borderSoft}`,
              background: "transparent",
              color: theme.textMute,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void props.onChoose()}
            style={{
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${theme.clay}`,
              background: theme.clay,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
            }}
          >
            Choose folder…
          </button>
        </div>
      </div>
    </div>
  );
}

import { type QuotaState } from "./agent.js";
export type Mode = "ask" | "accept-edits" | "bypass";
interface AppProps {
    root: string;
    model: string;
    mode: Mode;
    initialSessionId: string;
    initialApiMessages: any[];
    initialPrompt: string | null;
    buildClient: (onQuota?: (q: QuotaState) => void) => any;
    loadProjectContext: () => Promise<string>;
}
export declare function App(props: AppProps): import("react/jsx-runtime").JSX.Element;
export {};

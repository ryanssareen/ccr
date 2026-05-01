export declare function sessionPath(root: string, sessionId: string): string;
export declare function newSessionId(): string;
export declare function listSessions(root: string): Promise<string[]>;
export declare function loadSession(root: string, sessionId: string | null): Promise<{
    id: string;
    messages: any[];
}>;
export declare function saveSession(root: string, sessionId: string, messages: any[]): Promise<void>;

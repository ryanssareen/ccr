export type ApprovalKind = "edit" | "bash";
export interface ApprovalRequest {
    kind: ApprovalKind;
    title: string;
    detail: string;
}
export type Approver = (req: ApprovalRequest) => Promise<boolean>;
export interface ToolContext {
    root: string;
    approve: Approver;
}
export interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    readOnly: boolean;
    run: (ctx: ToolContext, args: any) => Promise<string>;
}
export declare const TOOLS: ToolDef[];
export declare const TOOL_BY_NAME: Record<string, ToolDef>;
export declare function toolSchemas(): {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}[];
export declare function dispatch(ctx: ToolContext, name: string, args: any): Promise<string>;

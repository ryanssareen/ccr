import type { CcrAuth, CcrConfig } from "@ccr/core";

export interface BootstrapPayload {
  auth: CcrAuth | null;
  config: CcrConfig;
  defaultProjectRoot: string;
}

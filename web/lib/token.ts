import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// CCR bearer token format: 64 lowercase hex chars (32 random bytes).
const TOKEN_BYTES = 32;
const TOKEN_HEX_LENGTH = TOKEN_BYTES * 2;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidTokenFormat(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length === TOKEN_HEX_LENGTH &&
    /^[0-9a-f]+$/.test(token)
  );
}

export function compareTokenHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

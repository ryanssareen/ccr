const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export function validateCliRedirect(value: string | null): string | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:") return null;
  if (!LOCAL_HOSTS.has(parsed.hostname)) return null;
  if (!parsed.port) return null;

  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;

  return parsed.toString();
}

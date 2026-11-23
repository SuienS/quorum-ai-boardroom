/**
 * Optional HTTP Basic Auth gate for the whole app, enabled by setting
 * QUORUM_BASIC_AUTH="username:password" on the server. Browsers prompt for the
 * credentials once and resend them with every request, including server-function
 * calls, so this protects the AI endpoints (and your API credits) without any UI.
 */
export const BASIC_AUTH_CHALLENGE = 'Basic realm="Quorum", charset="UTF-8"';

/** True when the Authorization header carries exactly the expected "username:password". */
export async function isAuthorized(
  header: string | null | undefined,
  expected: string,
): Promise<boolean> {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? "");
  if (!match?.[1]) return false;
  let provided: string;
  try {
    const binary = atob(match[1]);
    provided = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  return constantTimeEqual(provided, expected);
}

/** Compare SHA-256 digests so neither the content nor the length of the secret leaks through timing. */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

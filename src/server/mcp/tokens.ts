import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.MCP_SIGNING_SECRET || process.env.SESSION_SECRET || "ep-dashboard-generator";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

// Token propio `payload.firma`: no se guarda nada en la base, todo lo necesario viaja firmado.
export function sign(payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

export function verify<T extends Record<string, unknown>>(token: string, typ: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { typ?: string; exp?: number };
  if (payload.typ !== typ) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

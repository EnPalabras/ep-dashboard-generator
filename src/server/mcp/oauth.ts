import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { authEnabled, DEV_USER } from "../auth.ts";
import { hmac, sign, verify } from "./tokens.ts";

const ACCESS_TTL = 8 * 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const CODE_TTL = 300;

// Sólo Claude (web, desktop) y clientes locales (Claude Code) pueden registrarse.
const ALLOWED_REDIRECT = [
  /^https:\/\/claude\.ai\/api\/mcp\/auth_callback$/,
  /^https:\/\/claude\.com\/api\/mcp\/auth_callback$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/.*$/,
];

export interface McpUser {
  email: string;
  name: string;
}

const now = () => Math.floor(Date.now() / 1000);

// El client_id lleva firmados los datos del registro y el secret se deriva de él: no hay tabla de clientes.
const clientsStore: OAuthRegisteredClientsStore = {
  getClient(clientId) {
    const data = verify<{ info: Omit<OAuthClientInformationFull, "client_id" | "client_secret"> }>(clientId, "client");
    if (!data) return undefined;
    const info: OAuthClientInformationFull = { ...data.info, client_id: clientId };
    if (info.token_endpoint_auth_method !== "none") info.client_secret = hmac(`secret:${clientId}`);
    return info;
  },
  registerClient(client) {
    for (const uri of client.redirect_uris) {
      if (!ALLOWED_REDIRECT.some((re) => re.test(String(uri)))) {
        throw new InvalidClientMetadataError(`redirect_uri no permitida: ${uri}`);
      }
    }
    const { client_secret: _s, client_secret_expires_at: _e, ...info } = client;
    const clientId = sign({ typ: "client", info: { ...info, client_id_issued_at: now() }, n: randomUUID() });
    return this.getClient(clientId) as OAuthClientInformationFull;
  },
};

const usedCodes = new Map<string, number>();

function issueTokens(user: McpUser, clientId: string, resource?: string): OAuthTokens {
  const base = { sub: user.email, name: user.name, cid: clientId, resource };
  return {
    access_token: sign({ ...base, typ: "access", exp: now() + ACCESS_TTL }),
    refresh_token: sign({ ...base, typ: "refresh", exp: now() + REFRESH_TTL, n: randomUUID() }),
    token_type: "bearer",
    expires_in: ACCESS_TTL,
  };
}

type Pending = {
  cid: string;
  redirect_uri: string;
  state?: string;
  challenge: string;
  resource?: string;
};

export const provider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(client, params: AuthorizationParams, res) {
    const pending = sign({
      typ: "pending",
      exp: now() + 600,
      cid: client.client_id,
      redirect_uri: params.redirectUri,
      state: params.state,
      challenge: params.codeChallenge,
      resource: params.resource?.href,
    });
    res.redirect(`/mcp-auth/login?p=${encodeURIComponent(pending)}`);
  },

  async challengeForAuthorizationCode(_client, code) {
    const c = verify<{ challenge: string }>(code, "code");
    if (!c) throw new InvalidGrantError("Código inválido o vencido");
    return c.challenge;
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
    const c = verify<Pending & { sub: string; name: string }>(code, "code");
    if (!c || c.cid !== client.client_id) throw new InvalidGrantError("Código inválido o vencido");
    if (redirectUri && redirectUri !== c.redirect_uri) throw new InvalidGrantError("redirect_uri no coincide");
    if (usedCodes.has(code)) throw new InvalidGrantError("Código ya usado");
    usedCodes.set(code, now() + CODE_TTL);
    for (const [k, exp] of usedCodes) if (exp < now()) usedCodes.delete(k);
    return issueTokens({ email: c.sub, name: c.name }, client.client_id, c.resource);
  },

  async exchangeRefreshToken(client, refreshToken) {
    const r = verify<{ sub: string; name: string; cid: string; resource?: string }>(refreshToken, "refresh");
    if (!r || r.cid !== client.client_id) throw new InvalidGrantError("Refresh token inválido o vencido");
    return issueTokens({ email: r.sub, name: r.name }, client.client_id, r.resource);
  },

  async verifyAccessToken(token): Promise<AuthInfo> {
    const t = verify<{ sub: string; name: string; cid: string; exp: number; resource?: string }>(token, "access");
    if (!t) throw new InvalidTokenError("Token inválido o vencido");
    return {
      token,
      clientId: t.cid,
      scopes: [],
      expiresAt: t.exp,
      resource: t.resource ? new URL(t.resource) : undefined,
      extra: { email: t.sub, name: t.name },
    };
  },
};

// Paso intermedio del /authorize: exige la sesión de Google del generador y emite el código.
export function loginHandler(req: Request, res: Response) {
  const raw = String(req.query.p ?? "");
  const p = verify<Pending>(raw, "pending");
  if (!p) {
    res.status(400).send("Pedido de autorización inválido o vencido. Volvé a conectar el conector desde Claude.");
    return;
  }

  const user = authEnabled ? req.user : DEV_USER;
  if (!user) {
    req.session.returnTo = req.originalUrl;
    res.redirect("/auth/google");
    return;
  }

  const code = sign({ ...p, typ: "code", exp: now() + CODE_TTL, sub: user.email, name: user.name, n: randomUUID() });
  const target = new URL(p.redirect_uri);
  target.searchParams.set("code", code);
  if (p.state) target.searchParams.set("state", p.state);
  res.redirect(target.href);
}

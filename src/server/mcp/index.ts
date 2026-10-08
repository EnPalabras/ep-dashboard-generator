import express, { type Express } from "express";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { provider, loginHandler } from "./oauth.ts";
import { createMcpServer } from "./tools.ts";

const PUBLIC_URL = process.env.PUBLIC_URL || "https://ep-dashboard-generator-production.up.railway.app";

// Conector de Claude: OAuth propio (montado sobre el login de Google del generador) y MCP en /mcp.
export function mountMcp(app: Express) {
  const mcpUrl = new URL("/mcp", PUBLIC_URL);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(PUBLIC_URL),
      resourceServerUrl: mcpUrl,
      resourceName: "Datos de En Palabras",
    })
  );
  app.get("/mcp-auth/login", loginHandler);

  app.post(
    "/mcp",
    express.json({ limit: "20mb" }),
    requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
    async (req, res) => {
      const extra = req.auth?.extra as { email: string; name: string };
      const server = createMcpServer({ email: extra.email, name: extra.name });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (e: any) {
        console.error("[mcp]", e.message);
        if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Error interno" }, id: null });
      }
    }
  );
  app.all("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Método no permitido" }, id: null });
  });
}

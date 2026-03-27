import "dotenv/config";
import express from "express";
import path from "path";
import { setupAuth, requireAuth } from "./auth.ts";
import apiRoutes from "./routes/api.ts";
import dashboardRoutes from "./routes/dashboards.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

setupAuth(app);

app.use("/assets", express.static(path.resolve(import.meta.dir, "public/assets")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(requireAuth);

app.get("/api/me", (req, res) => {
  res.json(req.user);
});

app.use("/api", apiRoutes);
app.use(dashboardRoutes);

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
});

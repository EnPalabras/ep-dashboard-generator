import "dotenv/config";
import express from "express";
import path from "path";
import apiRoutes from "./routes/api.ts";
import dashboardRoutes from "./routes/dashboards.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Static assets
app.use("/assets", express.static(path.resolve(import.meta.dir, "public/assets")));

// API routes
app.use("/api", apiRoutes);

// Dashboard routes (home page + individual dashboards)
app.use(dashboardRoutes);

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
});

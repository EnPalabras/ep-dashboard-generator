import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import path from "path";

const router = Router();
const DASHBOARDS_DIR = path.resolve(import.meta.dir, "../../../dashboards");
const REGISTRY_PATH = path.join(DASHBOARDS_DIR, "registry.json");

interface DashboardEntry {
  slug: string;
  title: string;
  author: string;
  description: string;
  created: string;
  file: string;
}

function loadRegistry(): DashboardEntry[] {
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Home page
router.get("/", (req, res) => {
  const user = req.user!;
  const dashboards = loadRegistry();

  // Group by author
  const byAuthor: Record<string, DashboardEntry[]> = {};
  for (const d of dashboards) {
    (byAuthor[d.author] ??= []).push(d);
  }

  const sidebarHtml = Object.entries(byAuthor)
    .map(
      ([author, items]) => `
      <details open>
        <summary>${author}</summary>
        <ul>
          ${items
            .map(
              (d) =>
                `<li><a href="/d/${d.slug}"><strong>${d.title}</strong><br><small>${d.description}</small></a></li>`
            )
            .join("")}
        </ul>
      </details>`
    )
    .join("");

  const emptyState =
    dashboards.length === 0
      ? `<p>No dashboards yet. Open Claude Code in this repo and ask for one!</p>`
      : "";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>En Palabras — Dashboards</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    body { display: flex; min-height: 100vh; margin: 0; }
    nav.sidebar {
      width: 280px;
      min-width: 280px;
      padding: 1.5rem;
      border-right: 1px solid var(--pico-muted-border-color);
      overflow-y: auto;
    }
    nav.sidebar h2 { margin-top: 0; font-size: 1.2rem; }
    nav.sidebar ul { list-style: none; padding: 0; }
    nav.sidebar li { margin-bottom: 0.75rem; }
    nav.sidebar a { text-decoration: none; }
    nav.sidebar a:hover { text-decoration: underline; }
    nav.sidebar details summary { font-weight: 600; cursor: pointer; margin-bottom: 0.5rem; }
    main { flex: 1; padding: 2rem; overflow-y: auto; }
    .empty-state { text-align: center; margin-top: 4rem; color: var(--pico-muted-color); }
    .user-info {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.75rem 0; border-bottom: 1px solid var(--pico-muted-border-color);
      margin-bottom: 1rem; font-size: 0.85rem;
    }
    .user-info img { width: 28px; height: 28px; border-radius: 50%; }
    .user-info a { font-size: 0.75rem; color: var(--pico-muted-color); }
  </style>
</head>
<body>
  <nav class="sidebar">
    <div class="user-info">
      <img src="${user.picture}" alt="" referrerpolicy="no-referrer">
      <span>${user.name}</span>
      <a href="/auth/logout">Logout</a>
    </div>
    <h2>Dashboards</h2>
    ${sidebarHtml}
    ${emptyState ? `<div class="empty-state">${emptyState}</div>` : ""}
  </nav>
  <main>
    <div class="empty-state">
      <h1>En Palabras</h1>
      <p>Select a dashboard from the sidebar, or create a new one with Claude Code.</p>
    </div>
  </main>
</body>
</html>`);
});

// Serve individual dashboard
router.get("/d/:slug", (req, res) => {
  const { slug } = req.params;
  const dashboards = loadRegistry();
  const entry = dashboards.find((d) => d.slug === slug);

  if (!entry) {
    res.status(404).send("Dashboard not found");
    return;
  }

  const filePath = path.join(DASHBOARDS_DIR, entry.file);
  if (!existsSync(filePath)) {
    res.status(404).send("Dashboard file not found");
    return;
  }

  res.sendFile(filePath);
});

export default router;

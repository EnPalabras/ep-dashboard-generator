import { Router } from "express";
import { existsSync } from "fs";
import path from "path";
import pool from "../db/pool.ts";

const router = Router();
const DASHBOARDS_DIR = path.resolve(import.meta.dir, "../../../dashboards");

interface DashboardEntry {
  slug: string;
  title: string;
  author: string;
  description: string;
  file: string;
  created_at: string;
}

// Home page
router.get("/", async (req, res) => {
  const user = req.user!;
  const { rows: dashboards } = await pool.query<DashboardEntry>(
    "SELECT slug, title, author, description, file, created_at FROM dashboards ORDER BY created_at DESC"
  );

  // Group by author
  const byAuthor: Record<string, DashboardEntry[]> = {};
  for (const d of dashboards) {
    (byAuthor[d.author] ??= []).push(d);
  }

  const cardsHtml = Object.entries(byAuthor)
    .map(
      ([author, items]) => `
      <section class="author-group">
        <h3>${author}</h3>
        <div class="dashboard-grid">
          ${items
            .map(
              (d) => `
              <a href="/d/${d.slug}" class="dashboard-card">
                <strong>${d.title}</strong>
                <p>${d.description}</p>
                <small>${d.created_at}</small>
              </a>`
            )
            .join("")}
        </div>
      </section>`
    )
    .join("");

  const emptyState =
    dashboards.length === 0
      ? `<div class="empty-state"><p>No dashboards yet.<br>Open Claude Code in this repo and ask for one!</p></div>`
      : "";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>En Palabras — Dashboards</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; max-width: 100%; width: 100%; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--pico-muted-border-color);
    }
    header h1 { margin: 0; font-size: 1.3rem; }
    .user-info {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.85rem;
    }
    .user-info img { width: 28px; height: 28px; border-radius: 50%; }
    .user-info a { font-size: 0.75rem; color: var(--pico-muted-color); margin-left: 0.25rem; }
    main { flex: 1; padding: 2rem; max-width: 960px; margin: 0 auto; width: 100%; box-sizing: border-box; }
    .author-group { margin-bottom: 2rem; }
    .author-group h3 { font-size: 1rem; color: var(--pico-muted-color); margin-bottom: 0.75rem; }
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }
    .dashboard-card {
      display: block;
      padding: 1.25rem;
      border: 1px solid var(--pico-muted-border-color);
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .dashboard-card:hover {
      border-color: var(--pico-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .dashboard-card strong { font-size: 1.05rem; }
    .dashboard-card p { margin: 0.4rem 0; font-size: 0.9rem; color: var(--pico-muted-color); }
    .dashboard-card small { font-size: 0.75rem; color: var(--pico-muted-color); }
    .empty-state { text-align: center; margin-top: 4rem; color: var(--pico-muted-color); }
  </style>
</head>
<body>
  <header>
    <h1>En Palabras</h1>
    <div class="user-info">
      <img src="${user.picture}" alt="" referrerpolicy="no-referrer">
      <span>${user.name}</span>
      <a href="/auth/logout">Logout</a>
    </div>
  </header>
  <main>
    ${cardsHtml}
    ${emptyState}
  </main>
</body>
</html>`);
});

// Serve individual dashboard
router.get("/d/:slug", async (req, res) => {
  const { slug } = req.params;
  const { rows } = await pool.query<DashboardEntry>(
    "SELECT file FROM dashboards WHERE slug = $1",
    [slug]
  );

  if (rows.length === 0) {
    res.status(404).send("Dashboard not found");
    return;
  }

  const filePath = path.join(DASHBOARDS_DIR, rows[0].file);
  if (!existsSync(filePath)) {
    res.status(404).send("Dashboard file not found");
    return;
  }

  res.sendFile(filePath);
});

export default router;

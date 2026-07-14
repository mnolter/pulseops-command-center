import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
const shotsDir = path.join(root, "apps", "web", "public", "screenshots");

function imageData(name) {
  const bytes = readFileSync(path.join(shotsDir, name));
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

const shots = {
  overview: imageData("overview-recruiter.jpg"),
  services: imageData("services-recruiter.jpg"),
  incidents: imageData("incidents-recruiter.jpg"),
  alerts: imageData("alerts-recruiter.jpg")
};

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PulseOps | Full Stack Incident Command Center</title>
    <meta
      name="description"
      content="Recruiter-ready case study for PulseOps, a full-stack DevOps Incident Command Center built with Next.js, NestJS, PostgreSQL, Redis, Prisma, BullMQ and WebSockets."
    />
    <meta property="og:title" content="PulseOps | Full Stack Incident Command Center" />
    <meta
      property="og:description"
      content="A polished DevOps SaaS portfolio project with real backend architecture, incident workflows, workers, WebSockets and premium UI."
    />
    <style>
      :root {
        color-scheme: dark;
        --bg: #090b0f;
        --panel: #10141d;
        --panel-2: #151b26;
        --line: rgba(255, 255, 255, 0.11);
        --text: #f4f7fb;
        --muted: #9aa7b7;
        --cyan: #6bdcff;
        --green: #5df2a4;
        --amber: #f7c66b;
        --rose: #ff6b8a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at 18% 10%, rgba(107, 220, 255, 0.16), transparent 28rem),
          radial-gradient(circle at 82% 8%, rgba(93, 242, 164, 0.11), transparent 26rem),
          linear-gradient(135deg, #07090d, #10131a 54%, #080b10);
        color: var(--text);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
          sans-serif;
        letter-spacing: 0;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .wrap {
        width: min(1180px, calc(100% - 36px));
        margin: 0 auto;
      }

      header {
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid var(--line);
        background: rgba(9, 11, 15, 0.78);
        backdrop-filter: blur(18px);
      }

      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 72px;
        gap: 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 850;
      }

      .mark {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 1px solid rgba(107, 220, 255, 0.42);
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(107, 220, 255, 0.18), rgba(93, 242, 164, 0.1));
        color: var(--cyan);
      }

      .nav-links {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .nav-links a,
      .button {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.04);
      }

      .button.primary {
        border-color: rgba(93, 242, 164, 0.44);
        background: linear-gradient(135deg, rgba(93, 242, 164, 0.18), rgba(107, 220, 255, 0.12));
        color: var(--text);
        font-weight: 760;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 0.86fr) minmax(360px, 1fr);
        gap: 34px;
        align-items: center;
        padding: 66px 0 42px;
      }

      .eyebrow {
        color: var(--green);
        font-size: 0.78rem;
        font-weight: 900;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0;
        font-size: clamp(3rem, 8vw, 6.6rem);
        line-height: 0.92;
      }

      h2 {
        margin: 0 0 12px;
        font-size: clamp(1.8rem, 3vw, 3.1rem);
        line-height: 1;
      }

      p {
        color: var(--muted);
        line-height: 1.65;
      }

      .hero p {
        max-width: 650px;
        font-size: 1.05rem;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 24px;
      }

      .screen {
        overflow: hidden;
        border: 1px solid rgba(107, 220, 255, 0.22);
        border-radius: 8px;
        background: #0d1118;
        box-shadow: 0 26px 90px rgba(0, 0, 0, 0.42);
      }

      .screen img {
        display: block;
        width: 100%;
      }

      .metrics,
      .grid,
      .shots,
      .stack-grid {
        display: grid;
        gap: 16px;
      }

      .metrics {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin: 18px 0 46px;
      }

      .metric,
      .card,
      .diagram,
      .shot {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(16, 20, 29, 0.84);
      }

      .metric {
        padding: 18px;
      }

      .metric strong {
        display: block;
        margin-top: 8px;
        color: var(--green);
        font-size: 2.15rem;
      }

      .metric span,
      .card span {
        color: var(--muted);
        font-size: 0.82rem;
      }

      section {
        padding: 44px 0;
      }

      .grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .card {
        padding: 22px;
      }

      .card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 1.04rem;
      }

      .stack-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .diagram {
        padding: 20px;
      }

      .flow {
        display: grid;
        gap: 10px;
      }

      .node {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        padding: 12px 14px;
      }

      .node b {
        color: var(--text);
      }

      .node small {
        color: var(--muted);
      }

      .connector {
        height: 22px;
        border-left: 1px solid rgba(107, 220, 255, 0.4);
        margin-left: 18px;
      }

      .shots {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .shot {
        overflow: hidden;
      }

      .shot img {
        display: block;
        width: 100%;
      }

      .shot figcaption {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 14px;
        color: var(--muted);
      }

      footer {
        border-top: 1px solid var(--line);
        padding: 30px 0 46px;
        color: var(--muted);
      }

      @media (max-width: 900px) {
        .hero,
        .metrics,
        .grid,
        .stack-grid,
        .shots {
          grid-template-columns: 1fr;
        }

        .nav {
          align-items: flex-start;
          flex-direction: column;
          padding: 14px 0;
        }

        .nav-links {
          flex-wrap: wrap;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap nav">
        <a class="brand" href="#top" aria-label="PulseOps home">
          <span class="mark">~/</span>
          <span>PulseOps</span>
        </a>
        <nav class="nav-links" aria-label="Sections">
          <a href="#screens">Screens</a>
          <a href="#architecture">Architecture</a>
          <a href="#proof">Proof</a>
          <a class="button primary" href="#proof">Recruiter proof</a>
        </nav>
      </div>
    </header>

    <main id="top">
      <section class="wrap hero">
        <div>
          <div class="eyebrow">Full-stack SaaS portfolio project</div>
          <h1>DevOps Incident Command Center</h1>
          <p>
            PulseOps is a polished operational dashboard backed by a real TypeScript architecture:
            auth, organizations, monitors, checks, incidents, alert rules, audit logs,
            background workers and WebSocket events.
          </p>
          <div class="hero-actions">
            <a class="button primary" href="#screens">View screenshots</a>
            <a class="button" href="#architecture">Review architecture</a>
          </div>
        </div>
        <figure class="screen" aria-label="PulseOps overview screenshot">
          <img src="${shots.overview}" alt="PulseOps command center overview dashboard" />
        </figure>
      </section>

      <div class="wrap metrics" id="proof">
        <div class="metric"><span>Services modeled</span><strong>5</strong></div>
        <div class="metric"><span>Monitors seeded</span><strong>10</strong></div>
        <div class="metric"><span>Demo uptime</span><strong>98.7%</strong></div>
        <div class="metric"><span>Core tests</span><strong>11</strong></div>
      </div>

      <section class="wrap">
        <h2>What this demonstrates</h2>
        <div class="grid">
          <article class="card">
            <strong>Backend depth</strong>
            <p>NestJS API, Prisma schema, tenant isolation, role-aware sessions, audit records, incident lifecycle rules and OpenAPI docs.</p>
          </article>
          <article class="card">
            <strong>Operational systems thinking</strong>
            <p>BullMQ workers execute probes, persist check results, derive service health, deduplicate incidents and simulate alert delivery.</p>
          </article>
          <article class="card">
            <strong>Product-quality frontend</strong>
            <p>Dense dashboard UI, service map, command palette, live/fallback modes, charts, incident timelines and responsive layouts.</p>
          </article>
        </div>
      </section>

      <section class="wrap" id="architecture">
        <h2>Architecture at a glance</h2>
        <div class="stack-grid">
          <article class="diagram">
            <div class="flow">
              <div class="node"><b>Next.js app</b><small>dashboard, charts, realtime client</small></div>
              <div class="connector"></div>
              <div class="node"><b>NestJS API</b><small>REST, auth, RBAC, OpenAPI</small></div>
              <div class="connector"></div>
              <div class="node"><b>Prisma + PostgreSQL</b><small>tenant data, incidents, checks</small></div>
              <div class="connector"></div>
              <div class="node"><b>Redis + BullMQ</b><small>scheduled monitor workers</small></div>
            </div>
          </article>
          <article class="diagram">
            <div class="flow">
              <div class="node"><b>Probe fails</b><small>HTTP or synthetic monitor</small></div>
              <div class="connector"></div>
              <div class="node"><b>Check result saved</b><small>latency, status, error</small></div>
              <div class="connector"></div>
              <div class="node"><b>Incident opened</b><small>deduplicated per service</small></div>
              <div class="connector"></div>
              <div class="node"><b>Alert emitted</b><small>Slack/email/webhook simulation</small></div>
            </div>
          </article>
        </div>
      </section>

      <section class="wrap" id="screens">
        <h2>Product screenshots</h2>
        <div class="shots">
          <figure class="shot">
            <img src="${shots.overview}" alt="PulseOps overview dashboard" />
            <figcaption><b>Overview</b><span>Service health and latency stream</span></figcaption>
          </figure>
          <figure class="shot">
            <img src="${shots.services}" alt="PulseOps service catalog" />
            <figcaption><b>Services</b><span>Tenant-scoped service and monitor inventory</span></figcaption>
          </figure>
          <figure class="shot">
            <img src="${shots.incidents}" alt="PulseOps incident detail view" />
            <figcaption><b>Incidents</b><span>Priority queue and response timeline</span></figcaption>
          </figure>
          <figure class="shot">
            <img src="${shots.alerts}" alt="PulseOps alert rules and notification logs" />
            <figcaption><b>Alerts</b><span>Rules and simulated delivery trail</span></figcaption>
          </figure>
        </div>
      </section>
    </main>

    <footer>
      <div class="wrap">
        Built as a recruiter-ready full-stack portfolio project. Public page runs in curated demo mode; the repository contains the full local backend implementation.
      </div>
    </footer>
  </body>
</html>`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });
writeFileSync(path.join(dist, "package.json"), JSON.stringify({ type: "module" }));

const worker = `const html = ${JSON.stringify(html)};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, app: "PulseOps" });
    }

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    });
  }
};
`;

writeFileSync(path.join(serverDir, "index.js"), worker);
console.log(path.relative(root, path.join(serverDir, "index.js")));

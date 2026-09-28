# Memora

Memora is a collaborative space for collecting and reliving shared moments. Create an album, invite your people, gather photos and voice notes, and return to the gallery or turn those moments into scrapbook pages.

## Features

* Shared albums with member roles, invite links, passcodes, reactions, and voice notes.
* Gallery with a lightbox that slides, swipes, and preloads neighbouring photos.
* Multiple scrapbook pages per album.
* Canvas editor with photos, text, stickers, doodles, filters, torn edges, grouping, locking, layers, undo/redo, and templates.
* Real-time album and scrapbook updates with Pusher.
* Cloudflare R2 uploads with a same-origin photo proxy for canvas editing.
* Responsive layouts for desktop, tablet, and touch devices.

## Tech Stack

**Frontend**

* Vanilla JavaScript
* Vite
* Tailwind CSS v4
* Fabric.js
* Lucide
* Pusher
* QRCode

**Backend**

* Express
* TypeScript
* Drizzle ORM
* Neon Postgres
* JWT authentication
* Pusher

**Storage**

* Cloudflare R2 with presigned uploads

**Hosting**

* Vercel — the SPA as static output plus one Express function at `/api/*`

## Requirements

* Node.js 20+
* PostgreSQL-compatible database
* Cloudflare R2 credentials and a public R2 URL
* Pusher credentials

The current development setup uses Neon for PostgreSQL. The API reaches Neon
over HTTP (`neon-http`) rather than a WebSocket pool, so it also runs on hosts
that freeze the process between requests.

## Getting Started

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the required database, JWT, R2, Pusher, and client settings.

`JWT_SECRET` has no default. The API falls back to a fixed development string
only when it is neither in production nor on a serverless host, so an instance
deployed without a real secret refuses to sign or verify tokens rather than
trusting a value that is public in this repository. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Push the current schema to the development database:

```bash
npm run db:push
```

Seed sample data if needed:

```bash
npm run db:seed
```

Start the frontend and backend together:

```bash
npm run dev
```

By default:

* Frontend: `http://localhost:5173`
* API: `http://localhost:3001`

## Useful Commands

```bash
npm run dev
npm run build:frontend
npm run build:backend
npm run db:generate
npm run db:push
npm run db:studio
npm run db:seed
```

Generated Drizzle SQL is stored in `backend/drizzle/`.

The current development workflow uses `db:push`. For production, use reviewed and checked-in migrations (`npm run db:migrate`) rather than relying on an implicit schema push.

## Deployment

The app deploys to Vercel as a single project serving one origin: the built SPA
is the static output, and `api/index.js` runs the compiled Express app as a
serverless function. Keeping both on one origin is what removes the need for
CORS entirely.

* `vercel.json` holds the whole contract — install, build, output directory,
  the function's `maxDuration`, and the rewrites that send `/api/*` to the
  function and everything else to `index.html`.
* Set the **Root Directory** to the repository root, not `frontend` or
  `backend`. The build compiles both workspaces.
* Set `VITE_API_URL` to a bare `/api`. `VITE_*` values are compiled into the
  bundle, so they must exist before the first deploy. A relative value keeps
  preview deployments self-contained and survives a custom-domain change.
* Set `NODE_ENV=production` and a real `JWT_SECRET`.
* `installCommand` is `npm install --include=dev`. The backend is compiled by
  `tsc`, which is a devDependency, and Vercel defaults `NODE_ENV` to
  `production` for installs.

### Two settings outside Vercel that fail quietly

Neither is checked at boot, so both produce a partly working app rather than an
error:

* **R2 CORS** — Cloudflare Dashboard → R2 → bucket → Settings → CORS Policy.
  Browsers upload file bytes straight to R2 with a presigned URL, so the
  bucket must allow `PUT` from the deployed origin. Without this, uploads fail
  at the final step while everything before it succeeds.
* **Pusher authorized domains** — Pusher Channels → app → Settings. Without
  the deployed domain added, everything works except live updates.

## Project Structure

```text
api/
  index.js               serverless entry; re-exports the built Express app

frontend/
  main.js
  index.html
  src/
    components/          UI views, gallery lightbox, scrapbook editor
    core/                router, store, component lifecycle
    services/            API, uploads, audio, Pusher
    styles/              shared visual system

backend/
  src/
    routes/              API endpoints
    db/                  Drizzle schema, Neon client, seed data
    middleware/          JWT authentication
    lib/                 env detection, R2 and Pusher integrations
```

## Security and Data Handling

* Protected album, photo, and scrapbook operations verify album membership.
* Scrapbook saves use page revisions to detect stale edits.
* Locked scrapbook pages are read-only, including pointer interaction with the canvas.
* Never commit `.env` files, database URLs, JWT secrets, R2 credentials, or Pusher secrets.
* `JWT_SECRET` is required in production; there is no working fallback.
* Configure R2 CORS and public-access policies according to the deployment environment.
* The API photo proxy keeps browser canvas requests same-origin while preserving album access controls.

## Project Status

Memora is currently a working prototype under active development.

Authentication, deployment configuration, storage policies, and collaborative editing are still being tested and refined for real-world use.

## License

No license has been selected yet. Until a license is added, all rights are reserved by default.

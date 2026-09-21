# Memora

Memora is a collaborative space for collecting and reliving shared moments. Create an album, invite your people, gather photos and voice notes, and return to the gallery or turn those moments into scrapbook pages.

## Features

* Shared albums with member roles, invite links, passcodes, reactions, and voice notes.
* Gallery and lightbox views for browsing album photos.
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

## Requirements

* Node.js 20+
* PostgreSQL-compatible database
* Cloudflare R2 credentials and a public R2 URL
* Pusher credentials

The current development setup uses Neon for PostgreSQL.

## Getting Started

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the required database, JWT, R2, Pusher, and client settings.

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

The current development workflow uses `db:push`. For production, use reviewed and checked-in migrations rather than relying on an implicit schema push.

## Project Structure

```text
frontend/
  main.js
  src/
    components/       UI views and editor
    core/              router, store, component lifecycle
    services/          API, uploads, audio, Pusher
    styles/            shared visual system

backend/
  src/
    routes/            API endpoints
    db/                Drizzle schema and seed data
    middleware/        authentication
    lib/               R2 and Pusher integrations
```

## Security and Data Handling

* Protected album, photo, and scrapbook operations verify album membership.
* Scrapbook saves use page revisions to detect stale edits.
* Locked scrapbook pages are read-only, including pointer interaction with the canvas.
* Never commit `.env` files, database URLs, JWT secrets, R2 credentials, or Pusher secrets.
* Configure R2 CORS and public-access policies according to the deployment environment.
* The API photo proxy keeps browser canvas requests same-origin while preserving album access controls.

## Project Status

Memora is currently a working prototype under active development.

Authentication, deployment configuration, storage policies, and collaborative editing are still being tested and refined for real-world use.

## License

No license has been selected yet. Until a license is added, all rights are reserved by default.

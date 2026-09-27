/**
 * Vercel serverless entry point.
 *
 * Vercel mounts this file as a function and `vercel.json` rewrites `/api/*`
 * here, so the app is served from the same origin as the built frontend. That
 * removes the need for CORS on the deployed site entirely.
 *
 * The Express app itself is compiled to `backend/dist` by the project's build
 * command and merely re-exported here. This adapter stays thin on purpose: all
 * application logic keeps living in `backend/src`, which is also what
 * `npm run dev:backend` and `npm start` run, so there is exactly one app to
 * reason about rather than a serverless copy that can drift.
 */
import app from "../backend/dist/index.js";

export default app;

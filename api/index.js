/**
 * Vercel serverless entry point.
 *
 * Vercel mounts this file as a function and `vercel.json` rewrites `/api/*`
 * here, so the app is served from the same origin as the built frontend.
 */
import app from "../backend/dist/index.js";

export default app;

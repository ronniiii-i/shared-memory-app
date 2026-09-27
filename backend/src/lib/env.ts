/**
 * Environment detection shared by the server bootstrap and the auth middleware.
 *
 * `NODE_ENV` alone is not a dependable signal here. Vercel exposes `VERCEL` to
 * both the build and the function runtime, which is what we key off: anything
 * reachable from the internet must not fall back to development behaviour,
 * regardless of how NODE_ENV happens to be configured.
 */
export const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

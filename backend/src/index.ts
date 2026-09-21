import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ── Load environment variables from monorepo root ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Import middleware ──
import { parseAuthHeader } from "./middleware/auth.js";

// ── Import routes ──
import uploadRoutes from "./routes/upload.js";
import albumRoutes from "./routes/albums.js";
import photoRoutes from "./routes/photos.js";
import reactionRoutes from "./routes/reactions.js";
import audioRoutes from "./routes/audio.js";
import userRoutes from "./routes/users.js";
import scrapbookRoutes from "./routes/scrapbooks.js";

// ═══════════════════════════════════════════════════════════════
// Express Application Setup
// ═══════════════════════════════════════════════════════════════

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ── CORS ──
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── Body parsing ──
app.use(express.json({ limit: "10mb" }));

// ── Global JWT auth header parser ──
app.use(parseAuthHeader);

// ═══════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════

app.use("/api/upload", uploadRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/users", userRoutes);
app.use("/api/scrapbooks", scrapbookRoutes);

// ── Health check ──
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ═══════════════════════════════════════════════════════════════
// Global Error Handler
// ═══════════════════════════════════════════════════════════════

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("❌ Unhandled error:", err.message);
    console.error(err.stack);

    res.status(500).json({
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "production"
          ? "Something went wrong"
          : err.message,
    });
  },
);

// ═══════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  🚀 VibeVault API running on http://localhost:${PORT}`);
  console.log(
    `  📡 CORS origin: ${process.env.CLIENT_URL || "http://localhost:5173"}`,
  );
  console.log(`  🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("═══════════════════════════════════════════════════");
  console.log("");
});

export default app;

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { verifyEscrowRouter } from "./routes/verify-escrow.js";
import { pricesRouter } from "./routes/prices.js";
import { escrowsRouter } from "./routes/escrows.js";
import { createKeeperFromEnv } from "./services/keeper.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ENABLE_KEEPER = process.env.ENABLE_KEEPER === "true";

// Trust proxy (for Cloudflare and other reverse proxies)
app.set("trust proxy", true);

// CORS configuration - allow Cloudflare domain
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/verify-escrow", verifyEscrowRouter);
app.use("/api/prices", pricesRouter);
app.use("/api/escrows", escrowsRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Keeper status endpoint
app.get("/api/keeper/status", (req, res) => {
  const keeper = createKeeperFromEnv();
  if (!keeper) {
    return res.json({ enabled: false, error: "Keeper not configured" });
  }
  res.json({ enabled: ENABLE_KEEPER, ...keeper.getStatus() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);

  // Start keeper if enabled
  if (ENABLE_KEEPER) {
    const keeper = createKeeperFromEnv();
    if (keeper) {
      console.log("Starting keeper service...");
      keeper.start();
    } else {
      console.warn(
        "Keeper service not configured. Set FACTORY_ADDRESS_ETHEREUM, FACTORY_ADDRESS_BASE, and/or FACTORY_ADDRESS_CITREA environment variables along with corresponding RPC URLs.",
      );
    }
  } else {
    console.log(
      "Keeper service disabled. Set ENABLE_KEEPER=true to enable.",
    );
  }
});

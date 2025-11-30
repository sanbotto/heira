/**
 * Heira API Worker - Handles /api/escrow/verify route
 */

/// <reference types="@cloudflare/workers-types" />

import { D1StorageAdapter } from "../../shared/storage/d1-adapter.js";
import {
  verifyEscrowWithBlockscout,
  checkVerificationStatus,
} from "../../shared/verification/blockscout.js";
import {
  getCorsHeaders,
  handleOptions,
  errorResponse,
  jsonResponse,
} from "../../shared/utils.js";
import { VALID_NETWORKS, getExplorerUrl } from "../../shared/constants.js";
import type {
  VerifyEscrowRequest,
  VerifyEscrowResponse,
} from "../../shared/types.js";

// Standard JSON Input will be bundled at build time
// For now, we'll need to load it or bundle it
// This is a placeholder - in production, this should be imported/bundled
let STANDARD_JSON_INPUT = "";

// Try to load Standard JSON Input from build artifacts
// In production, this should be bundled at build time
async function loadStandardJsonInput(): Promise<string> {
  if (STANDARD_JSON_INPUT) {
    return STANDARD_JSON_INPUT;
  }

  // For now, return empty string - we'll need to bundle the build-info JSON
  // The Standard JSON Input is the entire build-info JSON file from Hardhat
  // This should be bundled at build time using a bundler or imported as a module
  return "";
}

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  ORIGIN_HOSTNAME?: string;
  BLOCKSCOUT_API_KEY?: string;
  // Standard JSON Input should be bundled or stored as a secret/env var
  STANDARD_JSON_INPUT?: string;
}

const allowCredentials = true;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Get the CORS headers
    const origin =
      request.headers.get("Origin") ||
      `https://${env.ORIGIN_HOSTNAME || "heira.app"}`;
    const corsHeaders = getCorsHeaders(
      env.ALLOWED_ORIGINS || "*",
      env.ORIGIN_HOSTNAME || "heira.app",
      origin,
      request.method,
      allowCredentials,
    );

    // Check required environment variables
    if (!env.DB) {
      return errorResponse(
        "Server configuration error: D1 database not configured",
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleOptions(
        env.ALLOWED_ORIGINS || "*",
        env.ORIGIN_HOSTNAME || "heira.app",
        request,
        allowCredentials,
      );
    }

    try {
      // Get the path from the URL
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "POST" && path === "/api/escrow/verify") {
        return await handleVerifyEscrow(request, env, corsHeaders);
      }

      return errorResponse(`Not Found: ${path}`, {
        status: 404,
        headers: corsHeaders,
      });
    } catch (err: any) {
      console.error(`Got an unhandled exception: ${err}`);
      return errorResponse(`Internal Server Error`, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};

async function handleVerifyEscrow(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    let json: VerifyEscrowRequest;
    try {
      json = await request.json();
    } catch (err) {
      console.error(`Failed to get JSON payload: ${err}`);
      return errorResponse("Invalid JSON payload", { headers: corsHeaders });
    }

    const { escrowAddress, mainWallet, inactivityPeriod, owner, network } =
      json;

    // Validate required fields
    if (
      !escrowAddress ||
      !mainWallet ||
      inactivityPeriod === undefined ||
      !owner ||
      !network
    ) {
      return errorResponse(
        "Missing required fields: escrowAddress, mainWallet, inactivityPeriod, owner, network",
        { headers: corsHeaders },
      );
    }

    // Validate network
    if (!VALID_NETWORKS.includes(network as any)) {
      return errorResponse(
        `Invalid network. Must be one of: ${VALID_NETWORKS.join(", ")}`,
        { headers: corsHeaders },
      );
    }

    // Load Standard JSON Input
    // In production, this should be bundled at build time
    const standardJsonInput =
      env.STANDARD_JSON_INPUT || (await loadStandardJsonInput());

    if (!standardJsonInput) {
      console.warn("Standard JSON Input not available - verification may fail");
      // Continue anyway - Blockscout might still work
    }

    // Check if already verified
    const isVerified = await checkVerificationStatus(
      escrowAddress,
      network,
      fetch,
    );
    if (isVerified) {
      return jsonResponse(
        {
          success: true,
          message: "Contract is already verified",
          explorerUrl: getExplorerUrl(network, escrowAddress),
          alreadyVerified: true,
        },
        { headers: corsHeaders },
      );
    }

    // Verify with Blockscout
    const verifyRequest: VerifyEscrowRequest = {
      escrowAddress,
      mainWallet,
      inactivityPeriod:
        typeof inactivityPeriod === "string"
          ? parseInt(inactivityPeriod)
          : inactivityPeriod,
      owner,
      network,
    };

    const result: VerifyEscrowResponse = await verifyEscrowWithBlockscout(
      verifyRequest,
      standardJsonInput,
      env.BLOCKSCOUT_API_KEY,
      fetch,
    );

    return jsonResponse(result, {
      status: result.success ? 200 : 500,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("Verification API error:", error);
    return errorResponse(`Internal server error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
}

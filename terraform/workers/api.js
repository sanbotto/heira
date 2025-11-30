// Heira API Worker - Handles /api/escrow/verify route
// Note: ethers (AbiCoder, getAddress) needs to be imported at top level for blockscout.js
// D1StorageAdapter, verifyEscrowWithBlockscout, checkVerificationStatus are available from concatenated files
// getCorsHeaders, handleOptions, errorResponse, jsonResponse are available from concatenated files
// VALID_NETWORKS, getExplorerUrl are available from concatenated files

const allowCredentials = true;

export default {
  async fetch(request, env) {
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
    } catch (err) {
      console.error(`Got an unhandled exception: ${err}`);
      return errorResponse(`Internal Server Error`, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};

async function handleVerifyEscrow(request, env, corsHeaders) {
  try {
    let json;
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
    if (!VALID_NETWORKS.includes(network)) {
      return errorResponse(
        `Invalid network. Must be one of: ${VALID_NETWORKS.join(", ")}`,
        { headers: corsHeaders },
      );
    }

    // Load Standard JSON Input from environment
    const standardJsonInput = env.STANDARD_JSON_INPUT || "";

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
    const verifyRequest = {
      escrowAddress,
      mainWallet,
      inactivityPeriod:
        typeof inactivityPeriod === "string"
          ? parseInt(inactivityPeriod)
          : inactivityPeriod,
      owner,
      network,
    };

    const result = await verifyEscrowWithBlockscout(
      verifyRequest,
      standardJsonInput,
      env.BLOCKSCOUT_API_KEY,
      fetch,
    );

    return jsonResponse(result, {
      status: result.success ? 200 : 500,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Verification API error:", error);
    return errorResponse(`Internal server error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
}

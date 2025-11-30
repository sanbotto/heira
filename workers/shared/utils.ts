/**
 * Shared utility functions
 */

/**
 * Check if an error indicates the contract is already verified
 */
export function isAlreadyVerified(error: any): boolean {
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("Already Verified") ||
    errorMessage.includes("already verified") ||
    errorMessage.includes("Contract source code already verified")
  );
}

/**
 * Create standardized JSON response
 */
export function jsonResponse(
  payload: any,
  options: { status?: number; headers?: Record<string, string> } = {},
) {
  const { status = 200, headers = {} } = options;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Create standardized error response
 */
export function errorResponse(
  message: string,
  options: { status?: number; headers?: Record<string, string> } = {},
) {
  const { status = 400, headers = {} } = options;
  return jsonResponse({ error: message }, { status, headers });
}

/**
 * Get CORS headers for a response
 */
export function getCorsHeaders(
  allowedOrigins: string,
  defaultOrigin: string,
  currentOrigin: string,
  method: string,
  allowCredentials = false,
): Record<string, string> {
  let corsHeaders: Record<string, string> = {};
  let originHeaderValue = `https://${defaultOrigin}`;
  const origins = String(allowedOrigins).replace(/\s+/g, "").split(",");

  // Check if the current origin is in the allowedOrigins list using regex
  for (const allowedOrigin of origins) {
    const regex = new RegExp(allowedOrigin);
    if (regex.test(currentOrigin)) {
      originHeaderValue = currentOrigin;
      break;
    }
  }

  if (method === "OPTIONS") {
    corsHeaders = {
      "Access-Control-Allow-Origin": originHeaderValue,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };
  } else if (method === "GET" || method === "POST") {
    corsHeaders = {
      "Access-Control-Allow-Origin": originHeaderValue,
      Vary: "Origin",
    };
  }

  if (allowCredentials) {
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }

  return corsHeaders;
}

/**
 * Handle OPTIONS request
 */
export async function handleOptions(
  allowedOrigins: string,
  defaultOrigin: string,
  request: Request,
  allowCredentials = false,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (
    origin !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Handle CORS preflight requests
    const corsHeaders = getCorsHeaders(
      allowedOrigins,
      defaultOrigin,
      origin,
      request.method,
      allowCredentials,
    );
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers":
          request.headers.get("Access-Control-Request-Headers") || "",
      },
    });
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: "GET, POST, OPTIONS",
      },
    });
  }
}

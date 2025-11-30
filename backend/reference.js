// jsonResponse returns standardized JSON responses
export function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })
}

// errorResponse returns standardized error responses
export function errorResponse(message, options = {}) {
  const { status = 400, headers = {} } = options
  return jsonResponse({ error: message }, { status, headers })
}

/**
 * Get the CORS headers for a given response.
 * It takes the origin and method as arguments and returns the appropriate CORS headers.
 * @param {string} allowedOrigins - A string list of all the allowed origins.
 * @param {string} defaultOrigin - The default origin to use if no match is found.
 * @param {string} currentOrigin - The origin of the request.
 * @param {string} method - The method of the request.
 * @param {boolean} [allowCredentials=false] - Whether to include the Access-Control-Allow-Credentials header with a value of 'true'.
 * @returns {object} - The CORS headers for the response.
 */
export function getCorsHeaders(allowedOrigins, defaultOrigin, currentOrigin, method, allowCredentials = false) {
  let corsHeaders = {}
  let originHeaderValue = `https://${defaultOrigin}`
  allowedOrigins = String(allowedOrigins).replace(/\s+/g, '').split(',')

  // Check if the current origin is in the allowedOrigins list using regex
  for (let i = 0; i < allowedOrigins.length; i++) {
    const allowedOrigin = allowedOrigins[i]
    const regex = new RegExp(allowedOrigin)
    if (regex.test(currentOrigin)) {
      originHeaderValue = currentOrigin
      console.log(`regex ${regex}, generated from allowedOrigin ${allowedOrigin}, is the one that worked. originHeaderValue is now ${originHeaderValue}`)
      break
    }
  }

  if (method === 'OPTIONS') {
    corsHeaders = {
      'Access-Control-Allow-Origin': originHeaderValue,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '86400'
    }
  } else if (method === 'GET' || method === 'POST') {
    corsHeaders = {
      'Access-Control-Allow-Origin': originHeaderValue,
      'Vary': 'Origin'
    }
  } else { // We shouldn't get here
    return null
  }

  if (allowCredentials) {
    corsHeaders['Access-Control-Allow-Credentials'] = 'true'
  }

  return corsHeaders
}

/**
 * Handle an OPTIONS request
 * @param {string} allowedOrigins - A string list of all the allowed origins.
 * @param {string} defaultOrigin - The default origin to use if no match is found.
 * @param {Request} request - The request object.
 * @param {boolean} [allowCredentials=false] - Whether to include the Access-Control-Allow-Credentials header with a value of 'true'.
 * @returns {Promise<Response>} - The response object.
 */
export async function handleOptions(allowedOrigins, defaultOrigin, request, allowCredentials = false) {
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS preflight requests
    const corsHeaders = getCorsHeaders(allowedOrigins, defaultOrigin, request.headers.get('Origin') || "undefined", request.method, allowCredentials)
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': request.headers.get(
          'Access-Control-Request-Headers'
        )
      }
    })
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: 'GET, POST, OPTIONS'
      }
    })
  }
}

// This file contains helper functions for handling JWTs

// base64url encodes an input as Base64URL
export function base64url(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// encodeUtf8 encodes a string as Uint8Array
export function encodeUtf8(str) {
  return new TextEncoder().encode(str)
}

// createJWT creates a JWT
export async function createJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" }
  const encHeader = base64url(encodeUtf8(JSON.stringify(header)))
  const encPayload = base64url(encodeUtf8(JSON.stringify(payload)))
  const data = `${encHeader}.${encPayload}`

  // Import secret key
  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )

  // Sign
  const signature = await crypto.subtle.sign("HMAC", key, encodeUtf8(data))
  const encSignature = base64url(signature)

  return `${data}.${encSignature}`
}

// verifyJWT verifies a JWT
export async function verifyJWT(token, secret) {
  const [encHeader, encPayload, encSignature] = token.split(".")
  if (!encHeader || !encPayload || !encSignature) throw new Error("Malformed JWT")

  const data = `${encHeader}.${encPayload}`
  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
  const signature = Uint8Array.from(atob(encSignature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const valid = await crypto.subtle.verify("HMAC", key, signature, encodeUtf8(data))
  if (!valid) throw new Error("Invalid signature")

  // Parse payload
  const payloadJson = new TextDecoder().decode(Uint8Array.from(atob(encPayload.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))
  return JSON.parse(payloadJson)
}

// parseCookies returns a map of cookies
export function parseCookies(cookieString) {
  const cookies = {}
  if (!cookieString) return cookies

  cookieString.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      cookies[name] = value
    }
  })
  return cookies
}

// getValidToken extracts and verifies a JWT token from cookies
export async function getValidToken(cookiesHeader, secret) {
  try {
    const cookie = parseCookies(cookiesHeader || "")
    const token = cookie['chatbot_terms_token']
    if (!token) return null
    const decoded = await verifyJWT(token, secret)
    return decoded
  } catch (err) {
    console.error('Token verification failed:', err)
    return null
  }
}


// Whether this worker expects credentials in CORS requests
const allowCredentials = true

// getResponseFromArchonApi sends a request to Archon's API and returns the response
async function getResponseFromArchonApi(apiPath, corsHeaders, env, payload, userCountry) {
  const CHAT_TIMEOUT_MS = env.CHAT_TIMEOUT_MS || 30000 // Default to 30 seconds if not set
  const abortController = new AbortController()
  let timeoutId = null
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort()
      reject(new Error('Request timed out'))
    }, CHAT_TIMEOUT_MS)
  })

  // Remove trailing slash from the endpoint if found
  const archonEndpoint = env.ARCHON_ENDPOINT.replace(/\/$/, '')

  try {
    // Send the request to Archon's API
    const response = await Promise.race([
      fetch(`${archonEndpoint}${apiPath}?sky-app-version=v1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': `${env.ARCHON_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      }),
      timeoutPromise
    ])

    clearTimeout(timeoutId) // Clear the timeout if fetch succeeded

    // Convert Archon's response headers to a plain object
    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    // Return the response from Archon plus our custom CORS headers
    return jsonResponse(await response.json(), {
      status: response.status,
      headers: {
        ...responseHeaders,
        ...corsHeaders
      }
    })
  } catch (err) {
    clearTimeout(timeoutId) // Make sure to clear the timeout in case of error
    return errorResponse(err.message, { status: 500, headers: corsHeaders })
  }
}

// Handler for /chat
export async function handleChat(request, env, corsHeaders) {
  let json
  let payload = {}

  try {
    json = await request.json()
  } catch (err) {
    console.error(`Failed to get JSON payload: ${err}`)
    return errorResponse('Invalid JSON payload', { headers: corsHeaders })
  }

  // Make sure that the payload has all the required fields
  if (
    json &&
    json.messages &&
    json.network &&
    json.session_id
  ) {

    // Get the terms acceptance UUID from the cookie
    const decoded = await getValidToken(request.headers.get("Cookie"), env.CHATBOT_TERMS_JWT_SECRET)
    if (!decoded || !decoded?.uuid) {
      return jsonResponse({
        error: 'TERMS_NOT_ACCEPTED',
        message: 'You must accept the terms before using the chatbot.'
      }, {
        status: 401,
        headers: corsHeaders
      })
    }

    // Build a new payload with only the required fields
    payload = {
      accepted_terms_hash: decoded?.uuid,
      messages: json.messages,
      network: json.network,
      session_id: json.session_id
    }
  } else {
    return errorResponse(`Invalid payload, at least one field is missing or invalid`, { headers: corsHeaders })
  }

  try {
    const userCountry = request.headers.get('CF-IPCountry')
    return await getResponseFromArchonApi('/chat', corsHeaders, env, payload, userCountry)
  } catch (err) {
    console.error(`Error while getting response from Archon's API: ${err}`)
    return errorResponse(`Error while getting response from remote API`, { status: 500, headers: corsHeaders })
  }
}

// Handler for /chatbot/feedback
export async function handleFeedback(request, env, corsHeaders) {
  let json
  let payload = {}

  try {
    json = await request.json()
  } catch (err) {
    console.error(`Failed to get JSON payload: ${err}`)
    return errorResponse('Invalid JSON payload', { headers: corsHeaders })
  }

  // Make sure that the payload has all the required fields
  if (
    json &&
    json.feedback_type &&
    json.session_id
  ) {

    // Get the terms acceptance UUID from the cookie
    const decoded = await getValidToken(request.headers.get("Cookie"), env.CHATBOT_TERMS_JWT_SECRET)
    if (!decoded || !decoded?.uuid) {
      return jsonResponse({
        error: 'TERMS_NOT_ACCEPTED',
        message: 'You must accept the terms before using the chatbot.'
      }, {
        status: 401,
        headers: corsHeaders
      })
    }

    // Build a new payload with only the required fields
    payload = {
      accepted_terms_hash: decoded?.uuid,
      feedback_type: json.feedback_type,
      session_id: json.session_id
    }
    // Add optional fields if they were provided
    if (json.comments) {
      payload.comments = json.comments
    }
  } else {
    return errorResponse(`Invalid payload, at least one field is missing or invalid`, { headers: corsHeaders })
  }

  try {
    const userCountry = request.headers.get('CF-IPCountry')
    return await getResponseFromArchonApi('/feedback', corsHeaders, env, payload, userCountry)
  } catch (err) {
    console.error(`Error while getting response from Archon's API: ${err}`)
    return errorResponse(`Error while getting response from remote API`, { status: 500, headers: corsHeaders })
  }
}

// Handler for /chatbot/terms/sign
export async function handleSign(request, env, corsHeaders) {
  let payload
  try {
    payload = await request.json()
  } catch (err) {
    console.warn(`Failed to get JSON payload. Setting payload to empty object.`)
    payload = {}
  }

  const decoded = await getValidToken(request.headers.get("Cookie"), env.CHATBOT_TERMS_JWT_SECRET)
  if (decoded && decoded?.termsVersion == env.CHATBOT_TERMS_VERSION_LATEST && decoded?.exp > Math.floor(Date.now() / 1000)) {
    return errorResponse('Terms already accepted', { headers: corsHeaders })
  }

  if (!payload?.termsVersion) {
    return errorResponse('Missing required fields in JSON payload: termsVersion', { headers: corsHeaders })
  }

  if (payload.termsVersion !== env.CHATBOT_TERMS_VERSION_LATEST) {
    return errorResponse(`Invalid terms version. Current version: ${env.CHATBOT_TERMS_VERSION_LATEST}`, { headers: corsHeaders })
  }

  const exp = Math.floor(Date.now() / 1000) + (env.CHATBOT_TERMS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60)
  const uuid = crypto.randomUUID()

  try {
    // If the testSignature element is not present in the payload (which is the default), store the acceptance in the DB
    if (!payload.testSignature) {
      const query = await env.D1.prepare(`INSERT INTO '${env.D1_TABLE_NAME}' (uuid, termsVersion, exp) VALUES (?1, ?2, ?3)`)
        .bind(uuid, payload.termsVersion, exp)
        .all()

      if (!query.success) {
        throw new Error(query.error || 'Failed to add the terms acceptance to the DB')
      }
    }

  } catch (err) {
    console.error(`Failed to add the terms acceptance to the DB. Error: ${err}`)
    return errorResponse(`Failed to add the terms acceptance to the DB`, { status: 500, headers: corsHeaders })
  }

  // Create JWT
  try {
    const jwtPayload = { uuid, termsVersion: payload.termsVersion, exp }
    const token = await createJWT(jwtPayload, env.CHATBOT_TERMS_JWT_SECRET)

    return jsonResponse({ exp }, {
      status: 201,
      headers: {
        ...corsHeaders,
        'Set-Cookie': `chatbot_terms_token=${token}; Max-Age=${env.CHATBOT_TERMS_TOKEN_EXPIRY_DAYS * 24 * 60 * 60}; Domain=${env.SKY_API_ENDPOINT.replace(/^https:\/\//, '')}; HttpOnly; Path=/; SameSite=None; Secure`,
      }
    })
  } catch (err) {
    console.error(`JWT creation failed. Error: ${err}`)
    return errorResponse('Failed to accept the terms', { status: 500, headers: corsHeaders })
  }
}

// Handler for /chatbot/terms/check
export async function handleCheck(request, env, corsHeaders) {
  const decoded = await getValidToken(request.headers.get("Cookie"), env.CHATBOT_TERMS_JWT_SECRET)

  if (!decoded) {
    console.error(`Missing or invalid token`)
    return errorResponse('Missing or invalid token', { headers: corsHeaders })
  }

  // Was the token issued for an old terms version? Has it expired?
  if (decoded?.termsVersion !== env.CHATBOT_TERMS_VERSION_LATEST || decoded?.exp < Math.floor(Date.now() / 1000)) {
    return errorResponse(`Terms signature expired. Latest terms version is: ${env.CHATBOT_TERMS_VERSION_LATEST}`, {
      headers: {
        ...corsHeaders,
        'Set-Cookie': `chatbot_terms_token=; Max-Age=0; Domain=${env.SKY_API_ENDPOINT.replace(/^https:\/\//, '')}; HttpOnly; Path=/; SameSite=None; Secure` // Clear the cookie
      }
    })
  }

  return jsonResponse({
    message: 'Token is valid, terms already accepted'
  }, {
    headers: corsHeaders
  })
}

// Handler for /chatbot/terms/remove
export async function handleRemove(request, env, corsHeaders) {
  const decoded = await getValidToken(request.headers.get("Cookie"), env.CHATBOT_TERMS_JWT_SECRET)

  if (!decoded) {
    console.error(`Missing or invalid token`)
    return errorResponse(`Missing token. Can't remove terms acceptance from DB without it.`, { headers: corsHeaders })
  }

  try {
    // Remove the terms acceptance for the provided UUID
    const query = await env.D1.prepare(`DELETE FROM '${env.D1_TABLE_NAME}' WHERE uuid = ?1`).bind(decoded?.uuid).all()

    if (!query.success) {
      throw new Error(query.error || 'Failed to remove the terms acceptance from the DB')
    }

    return jsonResponse({
      acceptanceRemoved: true
    }, {
      headers: corsHeaders
    })

  } catch (err) {
    console.error(`Failed to remove the terms acceptance from the DB. Error: ${err}`)
    return errorResponse(`Failed to remove the terms acceptance`, { status: 500, headers: corsHeaders })
  }
}

export default {
  async fetch(request, env) {
    // Get the CORS headers
    const origin = request.headers.get('Origin') || `https://${env.ORIGIN_HOSTNAME}`
    const corsHeaders = getCorsHeaders(env.ALLOWED_ORIGINS, env.ORIGIN_HOSTNAME, origin, request.method, allowCredentials)

    // Check if the required environment variables are set
    const requiredEnvVars = [
      'ALLOWED_ORIGINS',
      'ARCHON_API_KEY',
      'ARCHON_ENDPOINT',
      'CHAT_TIMEOUT_MS',
      'CHATBOT_TERMS_JWT_SECRET',
      'CHATBOT_TERMS_TOKEN_EXPIRY_DAYS',
      'CHATBOT_TERMS_VERSION_LATEST',
      'D1_TABLE_NAME',
      'ORIGIN_HOSTNAME',
      'SKY_API_ENDPOINT',
      'TECHOPS_SUPER_SPECIAL_HEADER'
    ]
    for (const envVar of requiredEnvVars) {
      if (!env[envVar]) {
        return errorResponse(`Server configuration error`, { status: 500, headers: corsHeaders })
      }
    }

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleOptions(env.ALLOWED_ORIGINS, env.ORIGIN_HOSTNAME, request, allowCredentials)
    }

    try {
      // Get the path from the URL
      const url = new URL(request.url)
      const path = url.pathname

      if (request.method === 'POST') {
        const postHandlers = {
          '/chat': handleChat,
          '/chatbot/feedback': handleFeedback,
          '/chatbot/terms/sign': handleSign,
          '/chatbot/terms/check': handleCheck,
          '/chatbot/terms/remove': handleRemove
        }

        const handler = postHandlers[path]
        if (handler) {
          return handler(request, env, corsHeaders)
        } else {
          return errorResponse(`Invalid path for POST requests: ${path}`, { status: 404, headers: corsHeaders })
        }
      }
    } catch (err) {
      console.error(`Got an unhandled exception from one of the handlers: ${err}`)
      return errorResponse(`Internal Server Error (CF Worker)`, { status: 500, headers: corsHeaders })
    }

    return errorResponse(`Method Not Allowed (CF Worker)`, { status: 405, headers: corsHeaders })
  }
}

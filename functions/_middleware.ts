/**
 * Middleware for admin endpoints authentication
 * Validates Cloudflare Access JWT or API key
 */

// JWT public keys cache
// IMPORTANT: This cache is in-memory and does NOT persist across Worker invocations.
// Since this runs as a Cloudflare Pages Function (not a Durable Object), every cold start
// will fetch certificates. This is an accepted tradeoff for simplicity.
// 
// For production with high traffic and frequent cold starts, consider migrating to:
// 1. Cloudflare KV with TTL (add env.CERTS_KV binding)
// 2. Durable Object for persistent cache
// 
// Current implementation: Accepts the overhead of occasional cert fetches (~once per cold start).
// Cold starts are relatively rare in Pages Functions with consistent traffic.
interface CertsCache {
  keys: JsonWebKey[];
  expiresAt: number;
}

let certsCache: CertsCache | null = null;
const CERTS_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Decode base64url string (handles - and _ chars, missing padding)
 */
function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if missing - correctly handle already-padded strings
  const pad = (4 - (base64.length % 4)) % 4;
  if (pad) {
    base64 += '='.repeat(pad);
  }
  
  return atob(base64);
}

/**
 * Fetch Cloudflare Access public keys with caching
 */
async function fetchCerts(teamDomain: string): Promise<JsonWebKey[]> {
  const now = Date.now();
  
  // Return cached certs if valid
  if (certsCache && certsCache.expiresAt > now) {
    return certsCache.keys;
  }
  
  // Fetch fresh certs
  const certsUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const response = await fetch(certsUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Cloudflare certs: ${response.status}`);
  }
  
  const data = await response.json() as { keys: JsonWebKey[] };
  
  // Cache the keys
  certsCache = {
    keys: data.keys,
    expiresAt: now + CERTS_TTL,
  };
  
  return data.keys;
}

/**
 * Verify JWT signature using Cloudflare's public keys
 */
async function verifyJwtSignature(
  token: string,
  publicKeys: JsonWebKey[]
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // Parse header to get key ID
  const headerJson = base64UrlDecode(parts[0]);
  const header = JSON.parse(headerJson) as { kid?: string; alg?: string };
  
  if (!header.kid || !header.alg) return false;
  
  // Find matching public key
  const publicKey = publicKeys.find(key => key.kid === header.kid);
  if (!publicKey) return false;
  
  try {
    // Import public key
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      publicKey,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['verify']
    );
    
    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    
    // Properly decode base64url signature (convert to base64, add padding, decode)
    // Padding calculation: base64url can have 0-3 padding chars
    // Formula handles already-padded strings correctly: (4 - len % 4) % 4
    const signatureBase64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (signatureBase64.length % 4)) % 4;
    const padded = signatureBase64 + '='.repeat(pad);
    const signature = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      data
    );
    
    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Verify Cloudflare Access JWT token with proper signature verification
 */
async function verifyCloudflareAccessToken(
  request: Request,
  teamDomain: string
): Promise<boolean> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;

  // Extract CF_Authorization cookie
  const cfAuth = cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('CF_Authorization='))
    ?.split('=')[1];

  if (!cfAuth) return false;

  try {
    // Fetch public keys (with caching)
    const publicKeys = await fetchCerts(teamDomain);
    
    // Verify signature
    const isValidSignature = await verifyJwtSignature(cfAuth, publicKeys);
    if (!isValidSignature) return false;
    
    // Parse payload (base64url-encoded)
    const parts = cfAuth.split('.');
    if (parts.length !== 3) return false;
    
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson) as { exp?: number };
    
    // Check expiration (exp is in seconds, Date.now() in milliseconds)
    const MILLISECONDS_TO_SECONDS = 1000;
    if (payload.exp && payload.exp < Date.now() / MILLISECONDS_TO_SECONDS) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return false;
  }
}

/**
 * Verify API key from Authorization header using timing-safe comparison
 */
async function verifyApiKey(request: Request, expectedKey: string): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Support "Bearer <key>" or just "<key>"
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  // Timing-safe comparison to prevent timing attacks
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);
  const expectedBytes = encoder.encode(expectedKey);
  
  const subtleWithTimingSafeEqual = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: BufferSource, b: BufferSource) => Promise<boolean>;
  };

  try {
    if (typeof subtleWithTimingSafeEqual.timingSafeEqual === 'function') {
      // Pad both inputs to same fixed size for constant-time comparison
      // This prevents timing leaks from both length differences and content comparison
      const maxLen = Math.max(tokenBytes.length, expectedBytes.length);
      const paddedToken = new Uint8Array(maxLen);
      const paddedExpected = new Uint8Array(maxLen);

      paddedToken.set(tokenBytes);
      paddedExpected.set(expectedBytes);

      const isEqual = await subtleWithTimingSafeEqual.timingSafeEqual(paddedToken, paddedExpected);
      return isEqual && tokenBytes.length === expectedBytes.length;
    }
  } catch {
    // Fall through to the string comparison below.
  }

  return token === expectedKey;
}

/**
 * Admin auth middleware
 * Protects /admin/* routes
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Only protect /admin/* routes
  if (!url.pathname.startsWith('/admin/')) {
    return next();
  }

  // Check API key first (faster)
  if (env.ADMIN_API_KEY && await verifyApiKey(request, env.ADMIN_API_KEY)) {
    return next();
  }

  // Check Cloudflare Access JWT
  if (env.CF_ACCESS_TEAM_DOMAIN) {
    const isValidJwt = await verifyCloudflareAccessToken(
      request,
      env.CF_ACCESS_TEAM_DOMAIN
    );
    if (isValidJwt) {
      return next();
    }
  }

  // No valid auth found
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: 'Valid authentication required. Provide API key or Cloudflare Access token.',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      },
    }
  );
};

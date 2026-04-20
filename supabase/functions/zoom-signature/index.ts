
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(req)
    });
  }

  try {
    const { meetingNumber, role } = await req.json();

    // Get Zoom SDK credentials from environment
    const sdkKey = Deno.env.get("ZOOM_SDK_KEY");
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET");


    if (!sdkKey || !sdkSecret) {
      throw new Error('Zoom SDK credentials not configured');
    }

    // Create JWT payload for Zoom Web SDK
    const iat = Math.round(new Date().getTime() / 1000);
    const exp = iat + 60 * 60 * 2; // 2 hours

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const payload = {
      iss: sdkKey,
      exp: exp,
      iat: iat,
      aud: 'zoom',
      appKey: sdkKey,
      tokenExp: exp,
      alg: 'HS256'
    };


    // Base64 URL encode function
    const base64UrlEncode = (obj: any) => {
      return btoa(JSON.stringify(obj))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    // Create HMAC SHA256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(sdkSecret);
    const messageData = encoder.encode(signatureInput);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signatureBuffer);
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const signature = `${headerEncoded}.${payloadEncoded}.${signatureBase64}`;


    return new Response(JSON.stringify({ 
      signature,
      sdkKey,
      meetingNumber,
      role 
    }), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req)
      }
    });

  } catch (error) {
    console.error('Zoom signature generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req)
      }
    });
  }
});
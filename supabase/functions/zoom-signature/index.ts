export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    const { meetingNumber, role } = await req.json();

    // Get Zoom SDK credentials from environment
    const sdkKey = Deno.env.get("ZOOM_SDK_KEY");
    const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET");

    console.log('SDK Key available:', !!sdkKey);
    console.log('SDK Secret available:', !!sdkSecret);

    if (!sdkKey || !sdkSecret) {
      throw new Error('Zoom SDK credentials not configured');
    }

    // Create JWT payload for Zoom Web SDK
    const iat = Math.round(new Date().getTime() / 1000) - 30;
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

    console.log('Generating signature for meeting:', meetingNumber, 'with role:', role);

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

    console.log('Generated signature successfully');

    return new Response(JSON.stringify({ 
      signature,
      sdkKey,
      meetingNumber,
      role 
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
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
        ...corsHeaders
      }
    });
  }
});
// Declare ZoomMtg on window
declare global {
  interface Window {
    ZoomMtg: any;
  }
}

let zoomSDKLoaded = false;
let zoomSDKLoading = false;
let loadPromise: Promise<void> | null = null;

// Helper function to check if an error is Zoom-related and should be suppressed
const isZoomTelemetryError = (message: any, source?: string, error?: Error): boolean => {
  const messageStr = String(message || '');
  const sourceStr = String(source || '');
  const errorMessage = error?.message || '';
  const errorStack = error?.stack || '';
  
  // Check for Zoom telemetry/logging errors
  const zoomPatterns = [
    'log-external-gateway.zoom.us',
    'zoom.us/meeting-external',
    'Request failed, status: 0',
    'status: 0, responseText:',
    'TPCBC',
    'VideoSDK',
    'TP_INFO',
    'MEDIA SDK Direct'
  ];
  
  return zoomPatterns.some(pattern => 
    messageStr.includes(pattern) || 
    sourceStr.includes(pattern) || 
    errorMessage.includes(pattern) ||
    errorStack.includes(pattern)
  );
};

// Global error handler for Wake Lock and Zoom telemetry errors
if (typeof window !== 'undefined') {
  const originalError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Suppress Wake Lock errors from Zoom SDK
    if (error?.name === 'NotAllowedError' && 
        (error?.message?.includes('WakeLock') || source?.includes('zoom'))) {
      console.log('ℹ️ Wake Lock error suppressed - non-critical for Zoom functionality');
      return true; // Prevent error from bubbling up
    }
    
    // Suppress Zoom telemetry/logging errors (status 0 network failures)
    if (isZoomTelemetryError(message, source, error)) {
      console.log('ℹ️ Zoom telemetry error suppressed - non-critical for functionality');
      return true; // Prevent error from bubbling up
    }
    
    // Call original error handler if it exists
    if (originalError) {
      return originalError(message, source, lineno, colno, error);
    }
    return false;
  };

  // Also catch unhandled promise rejections for Wake Lock and Zoom telemetry
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    
    // Suppress Wake Lock errors
    if (reason?.name === 'NotAllowedError' && 
        reason?.message?.includes('WakeLock')) {
      console.log('ℹ️ Wake Lock promise rejection suppressed');
      event.preventDefault();
      return;
    }
    
    // Suppress Zoom telemetry errors
    if (isZoomTelemetryError(reason?.message, '', reason)) {
      console.log('ℹ️ Zoom telemetry promise rejection suppressed');
      event.preventDefault();
      return;
    }
    
    // Suppress status 0 network errors (typically CORS or cancelled requests)
    if (reason?.message?.includes('status: 0') || 
        reason?.message?.includes('Failed to fetch') ||
        (reason?.message?.includes('Request failed') && reason?.message?.includes('status: 0'))) {
      // Check if it's related to Zoom
      const stack = reason?.stack || '';
      if (stack.includes('zoom') || stack.includes('Zoom')) {
        console.log('ℹ️ Zoom network error suppressed');
        event.preventDefault();
        return;
      }
    }
  });
  
  // Intercept fetch to suppress Zoom telemetry errors
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
    
    try {
      return await originalFetch.apply(this, args);
    } catch (error: any) {
      // Suppress Zoom telemetry fetch errors silently
      if (url.includes('log-external-gateway.zoom.us') || 
          url.includes('zoom.us/meeting-external')) {
        console.log('ℹ️ Zoom telemetry fetch error suppressed:', url);
        // Return a fake successful response for telemetry
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }
  };
}

export const loadZoomSDK = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.ZoomMtg) {
      resolve();
      return;
    }

    // Create script element for Zoom SDK
    const script = document.createElement('script');
    script.src = 'https://source.zoom.us/2.18.0/lib/vendor/react.min.js';
    script.async = true;
    
    script.onload = () => {
      const script2 = document.createElement('script');
      script2.src = 'https://source.zoom.us/2.18.0/lib/vendor/react-dom.min.js';
      script2.async = true;
      
      script2.onload = () => {
        const script3 = document.createElement('script');
        script3.src = 'https://source.zoom.us/2.18.0/lib/vendor/redux.min.js';
        script3.async = true;
        
        script3.onload = () => {
          const script4 = document.createElement('script');
          script4.src = 'https://source.zoom.us/2.18.0/lib/vendor/redux-thunk.min.js';
          script4.async = true;
          
          script4.onload = () => {
            const script5 = document.createElement('script');
            script5.src = 'https://source.zoom.us/2.18.0/lib/vendor/lodash.min.js';
            script5.async = true;
            
            script5.onload = () => {
              const mainScript = document.createElement('script');
              mainScript.src = 'https://source.zoom.us/2.18.0/zoom-meeting-2.18.0.min.js';
              mainScript.async = true;
              
              mainScript.onload = () => {
                // Configure Zoom to prevent WakeLock errors
                if (window.ZoomMtg) {
                  try {
                    window.ZoomMtg.setZoomJSLib('https://source.zoom.us/2.18.0/lib', '/av');
                    window.ZoomMtg.preLoadWasm();
                    window.ZoomMtg.prepareWebSDK();
                    
                    // Configure embedded mode
                    window.ZoomMtg.embedded = true;
                    
                    console.log('✅ Zoom SDK loaded and configured');
                    resolve();
                  } catch (err: any) {
                    // Ignore Wake Lock errors
                    if (err?.name === 'NotAllowedError' || err?.message?.includes('WakeLock')) {
                      console.log('ℹ️ Wake Lock not available - continuing without it');
                      resolve();
                    } else {
                      console.warn('⚠️ Zoom SDK initialization warning:', err);
                      resolve(); // Still resolve as it's non-critical
                    }
                  }
                } else {
                  reject(new Error('Zoom SDK failed to load'));
                }
              };
              
              mainScript.onerror = () => reject(new Error('Failed to load Zoom SDK main script'));
              document.head.appendChild(mainScript);
            };
            
            script5.onerror = () => reject(new Error('Failed to load lodash'));
            document.head.appendChild(script5);
          };
          
          script4.onerror = () => reject(new Error('Failed to load redux-thunk'));
          document.head.appendChild(script4);
        };
        
        script3.onerror = () => reject(new Error('Failed to load redux'));
        document.head.appendChild(script3);
      };
      
      script2.onerror = () => reject(new Error('Failed to load react-dom'));
      document.head.appendChild(script2);
    };
    
    script.onerror = () => reject(new Error('Failed to load react'));
    document.head.appendChild(script);
  });
};
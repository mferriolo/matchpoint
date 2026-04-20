import { useState, useCallback, useRef } from 'react';

declare global {
  interface Window {
    ZoomMtg: any;
    zoomSDKReady: boolean;
  }
}

interface ZoomConfig {
  sdkKey: string;
  sdkSecret: string;
}

interface JoinMeetingConfig {
  meetingNumber: string;
  passWord?: string;
  userName: string;
  userEmail?: string;
  role: number;
  signature: string;
}

export const useZoomSDK = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const initializationAttempted = useRef(false);
  const isJoining = useRef(false);

  const initializeSDK = useCallback(async (config: ZoomConfig): Promise<void> => {
    if (initializationAttempted.current || isInitialized) {
      console.log('useZoomSDK: Already initialized, skipping...');
      return;
    }

    if (!window.ZoomMtg) {
      throw new Error('Zoom SDK not loaded');
    }

    initializationAttempted.current = true;
    console.log('useZoomSDK: Starting initialization...');

    try {
      console.log('useZoomSDK: Setting Zoom JS Lib path...');
      window.ZoomMtg.setZoomJSLib('https://source.zoom.us/2.18.0/lib', '/av');
      
      console.log('useZoomSDK: Preloading WebAssembly...');
      window.ZoomMtg.preLoadWasm();
      window.ZoomMtg.prepareWebSDK();

      console.log('useZoomSDK: Initializing i18n...');
      window.ZoomMtg.i18n.load('en-US');
      window.ZoomMtg.i18n.reload('en-US');

      console.log('useZoomSDK: Calling ZoomMtg.init()...');
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SDK initialization timeout'));
        }, 30000);

        window.ZoomMtg.init({
          leaveUrl: window.location.origin,
          disableInvite: false,
          isSupportAV: true,
          success: () => {
            clearTimeout(timeout);
            console.log('✅ Zoom SDK initialized');
            setIsInitialized(true);
            setError(null);
            resolve();
          },
          error: (err: any) => {
            clearTimeout(timeout);
            console.error('❌ Zoom init failed:', err);
            setError(err?.message || 'Failed to initialize');
            reject(err);
          }
        });
      });
    } catch (err: any) {
      console.error('useZoomSDK: Init error:', err);
      setError(err.message);
      // Don't reset initializationAttempted - prevents concurrent re-init race condition
      throw err;
    }
  }, [isInitialized]);

  const joinMeeting = useCallback(async (config: JoinMeetingConfig): Promise<void> => {
    if (!isInitialized) {
      throw new Error('SDK not initialized');
    }

    if (isJoining.current) {
      console.log('useZoomSDK: Already joining, skipping...');
      return;
    }

    if (!window.ZoomMtg) {
      throw new Error('Zoom SDK not available');
    }

    isJoining.current = true;
    console.log('useZoomSDK: Joining meeting...', config.meetingNumber);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Join meeting timeout'));
        }, 30000);

        // CRITICAL FIX: Proper join configuration for embedding
        window.ZoomMtg.join({
          meetingNumber: config.meetingNumber,
          userName: config.userName,
          signature: config.signature,
          sdkKey: 'placeholder',
          userEmail: config.userEmail || '',
          passWord: config.passWord || '',
          // CRITICAL: These settings force embedding instead of popup
          tk: '',
          zak: '',
          success: (success: any) => {
            clearTimeout(timeout);
            console.log('✅ useZoomSDK: Successfully joined meeting', success);
            setIsInMeeting(true);
            setError(null);
            isJoining.current = false;
            resolve();
          },
          error: (err: any) => {
            clearTimeout(timeout);
            console.error('❌ useZoomSDK: Failed to join meeting:', err);
            console.error('Full error object:', JSON.stringify(err, null, 2));
            
            const errorMessage = err?.message || err?.reason || 'Failed to join meeting';
            setError(errorMessage);
            isJoining.current = false;
            reject(new Error(errorMessage));
          }
        });
      });
    } catch (err: any) {
      console.error('useZoomSDK: Join meeting error:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      setError(err.message);
      isJoining.current = false;
      throw err;
    }
  }, [isInitialized]);


  const leaveMeeting = useCallback(async () => {
    try {
      if (window.ZoomMtg && isInMeeting) {
        window.ZoomMtg.leaveMeeting({
          success: () => {
            console.log('Left meeting');
            setIsInMeeting(false);
            setError(null);
          },
          error: (error: any) => {
            console.error('Leave failed:', error);
          }
        });
      } else {
        setIsInMeeting(false);
      }
    } catch (err: any) {
      console.error('Leave error:', err);
      setIsInMeeting(false);
    }
  }, [isInMeeting]);

  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: false 
      });
      setAudioStream(stream);
      console.log('Audio capture started');
    } catch (err: any) {
      console.error('Audio capture failed:', err);
      setError('Failed to start audio: ' + err.message);
    }
  }, []);

  const stopAudioCapture = useCallback(() => {
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
      console.log('Audio capture stopped');
    }
  }, [audioStream]);

  return {
    isInitialized,
    isInMeeting,
    audioStream,
    initializeSDK,
    joinMeeting,
    leaveMeeting,
    startAudioCapture,
    stopAudioCapture,
    error
  };
};

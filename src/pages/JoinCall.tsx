// Force rebuild - version 9
import React, { useState, useEffect, useRef } from 'react';

import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Video, Mic, MicOff, VideoOff, PhoneOff, User, Users } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import ZoomVideo from '@zoom/videosdk';

const JoinCall: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionName = searchParams.get('session');
  
  const [userName, setUserName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [hasOwnVideo, setHasOwnVideo] = useState(false);
  const [hasHostVideo, setHasHostVideo] = useState(false);


  const localVideoRef = useRef<HTMLDivElement>(null);
  const hostVideoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const videoStartedRef = useRef(false);



  // Start video and audio after joining and refs are ready
  useEffect(() => {
    if (!hasJoined || !clientRef.current || !streamRef.current) {
      return;
    }

    if (!localVideoRef.current || !hostVideoRef.current) {
      console.log('⏳ Refs not ready yet, waiting...');
      return;
    }

    // Start video rendering
    const startVideoAndAudio = async () => {
      // Prevent duplicate initialization
      if (videoStartedRef.current) {
        console.log('⏭️ Video already started, skipping');
        return;
      }
      videoStartedRef.current = true;

      try {
        console.log('🔵 Starting participant video...');

        
        // Start the video stream
        console.log('🔵 About to call startVideo()...');
        await streamRef.current.startVideo();
        console.log('✅ Video stream started');
        
        // Get participant's own userId
        console.log('🔵 About to get current user info...');
        const currentUser = clientRef.current.getCurrentUserInfo();
        console.log('🔵 Got current user:', currentUser);
        const ownUserId = currentUser.userId;
        console.log('👤 Participant userId:', ownUserId);
        
        // Use attachVideo for self-view
        const videoElement = await streamRef.current.attachVideo(ownUserId, 3);
        console.log('✅ Self-view element created:', videoElement?.tagName);
        
        if (!videoElement) {
          throw new Error('Failed to create video element for self-view');
        }
        
        // Create wrapper container (custom element, not div!)
        const container = document.createElement('video-player-container');
        container.style.width = '100%';
        container.style.height = '100%';
        
        // Style the video element
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        videoElement.style.display = 'block';
        
        // Append video to container, then container to ref
        container.appendChild(videoElement);
        localVideoRef.current.innerHTML = '';
        localVideoRef.current.appendChild(container);
        
        setHasOwnVideo(true);
        console.log('✅ PARTICIPANT CAN NOW SEE THEMSELVES');
        
        // Start audio
        console.log('🔵 Starting participant audio...');
        await streamRef.current.startAudio();
        console.log('✅ Participant audio started');
        
      } catch (err: any) {
        console.error('❌ Error starting video/audio:', err);
        console.error('❌ Error message:', err?.message);
        console.error('❌ Error stack:', err?.stack);
      }
    };

    startVideoAndAudio();
  }, [hasJoined, localVideoRef.current, hostVideoRef.current]);

  const joinSession = async () => {

    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    console.log('📝 Participant name entered:', userName);

    if (!sessionName) {
      setError('Invalid session link');
      return;
    }

    try {
      setError('');
      setIsJoining(true);
      console.log('🔵 Starting join process...');

      // Get JWT token from backend
      const { data, error: functionError } = await supabase.functions.invoke(
        'create-zoom-session',
        {
          body: {
            sessionName,
            userName,
            role: 0, // participant role
          },
        }
      );

      if (functionError) throw functionError;
      if (!data || !data.jwt) throw new Error('No token received');

      const jwt = data.jwt;
      console.log('✅ JWT received');

      // Initialize Zoom Video SDK
      console.log('🔵 Initializing Video SDK...');
      clientRef.current = ZoomVideo.createClient();
      await clientRef.current.init('en-US', 'CDN', {
        patchJsMedia: true,
        leaveOnPageUnload: true,
      });
      console.log('✅ Video SDK initialized');

      // Join session
      console.log('🔵 Joining Zoom session with name:', userName);
      await clientRef.current.join(sessionName, jwt, userName, '');
      console.log('✅ Joined session');


      streamRef.current = clientRef.current.getMediaStream();
      console.log('✅ Got media stream');

      // Log refs status immediately after join
      console.log('📍 Refs stored:', {
        hasClientRef: !!clientRef.current,
        hasStreamRef: !!streamRef.current,
        hasLocalVideoRef: !!localVideoRef.current,
        hasHostVideoRef: !!hostVideoRef.current
      });

      // Video and audio will be started in useEffect after component renders
      console.log('✅ Session joined, refs will be initialized after render');


      // Setup event listener for host video

      console.log('🔵 Setting up host video listener...');
      clientRef.current.on('peer-video-state-change', async (payload: any) => {
        console.log('🎥 HOST video event:', payload);
        
        if (payload.action === 'Start') {
          console.log('👤 Host video started, userId:', payload.userId);
          
          if (!hostVideoRef.current || !streamRef.current) {
            console.error('❌ Missing hostVideoRef or streamRef');
            return;
          }
          
          try {
            console.log('🔵 Rendering host video...');
            
            // Get video element FIRST (same as working participant pattern)
            const videoElement = await streamRef.current.attachVideo(payload.userId, 3);
            console.log('✅ Host element created:', videoElement?.tagName);

            
            if (!videoElement) {
              throw new Error('Failed to create video element for host');
            }
            
            // Create wrapper container (custom element, not div!)
            const container = document.createElement('video-player-container');
            container.style.width = '100%';
            container.style.height = '100%';
            
            // Style the video element
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.objectFit = 'cover';
            videoElement.style.display = 'block';
            
            // Append video to container, then container to ref (SAME ORDER AS WORKING CODE)
            container.appendChild(videoElement);
            hostVideoRef.current.innerHTML = '';
            hostVideoRef.current.appendChild(container);

            
            setHasHostVideo(true);
            console.log('✅ Host video now visible to participant');
            
          } catch (err: any) {
            console.error('❌ Error rendering host video:', err);
            console.error('❌ Error details:', err?.message, err?.stack);
            setHasHostVideo(false);
          }
        } else if (payload.action === 'Stop') {
          console.log('⏹️ Host stopped video');
          if (hostVideoRef.current) {
            hostVideoRef.current.innerHTML = '';
          }
          setHasHostVideo(false);
        }
      });





      // Host video will appear via peer-video-state-change event listener
      console.log('✅ Event listeners set up, ready for host video');

      // Check for existing participants with video already on
      console.log('🔵 Checking for existing participants...');
      const allUsers = clientRef.current.getAllUser();
      console.log('All users in session:', allUsers);

      // Wait for refs to be fully ready
      setTimeout(async () => {
        if (!hostVideoRef.current || !streamRef.current) {
          console.log('⏳ Host ref not ready yet, will catch via event listener');
          return;
        }
        
        for (const user of allUsers) {
          if (user.userId !== clientRef.current.getCurrentUserInfo().userId) {
            console.log('Found existing user:', user);
            
            if (user.bVideoOn) {
              console.log('🎥 Existing user has video on, rendering...');
              
              try {
                // Get video element
                const videoElement = await streamRef.current.attachVideo(user.userId, 3);
                
                if (videoElement) {
                  // Create wrapper container (custom element!)
                  const container = document.createElement('video-player-container');
                  container.style.width = '100%';
                  container.style.height = '100%';
                  
                  // Style the video element
                  videoElement.style.width = '100%';
                  videoElement.style.height = '100%';
                  videoElement.style.objectFit = 'cover';
                  videoElement.style.display = 'block';
                  
                  // Append video to container, then container to ref
                  container.appendChild(videoElement);
                  hostVideoRef.current.innerHTML = '';
                  hostVideoRef.current.appendChild(container);
                  
                  setHasHostVideo(true);
                  console.log('✅ Existing user video rendered');
                }
              } catch (err) {
                console.error('❌ Error rendering existing user video:', err);
                setHasHostVideo(false);
              }
            }
          }
        }
      }, 1000);









      setHasJoined(true);
      console.log('✅ Joined successfully!');
      
    } catch (err: any) {
      console.error('Failed to join:', err);
      setError(err.message || 'Failed to join session');
    } finally {
      setIsJoining(false);
    }
  };

  const toggleAudio = async () => {
    if (!streamRef.current) return;
    
    if (isAudioMuted) {
      await streamRef.current.unmuteAudio();
    } else {
      await streamRef.current.muteAudio();
    }
    setIsAudioMuted(!isAudioMuted);
  };

  const toggleVideo = async () => {
    if (!streamRef.current) return;
    
    if (isVideoOff) {
      await streamRef.current.startVideo();
    } else {
      await streamRef.current.stopVideo();
    }
    setIsVideoOff(!isVideoOff);
  };

  const leaveCall = async () => {
    if (clientRef.current) {
      try {
        // Try to end session for everyone (may require host privileges)
        await clientRef.current.leave(true);
        console.log('✅ Participant ended session');
      } catch (error) {
        console.error('Error ending session:', error);
        // Fallback to just leaving
        await clientRef.current.leave();
      }
      setHasJoined(false);
    }
  };


  if (!sessionName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Alert variant="destructive">
          <AlertDescription>Invalid session link</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-6 w-6 text-blue-600" />
              Join Video Call
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Your Name</label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                onKeyPress={(e) => e.key === 'Enter' && joinSession()}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button onClick={joinSession} className="w-full" disabled={isJoining || !userName.trim()}>
              {isJoining ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Joining...</> : <>Join Call</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Connection Status Card - COMPACT */}
        <Card className="mb-3 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300">
          <CardContent className="pt-3 pb-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <span>🔌</span>
                <span>Connection Status:</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${streamRef.current && !isVideoOff ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="truncate">Your Video: {streamRef.current && !isVideoOff ? '✅' : '⏳'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!isAudioMuted && streamRef.current ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="truncate">Your Audio: {isAudioMuted ? '🔇' : '✅'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 bg-green-500 animate-pulse`}></div>
                  <span className="truncate">Host: ✅</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasHostVideo ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`}></div>
                  <span className="truncate">Host Video: {hasHostVideo ? '✅' : '⏳'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>



        {/* VIDEO CONTAINERS - ALWAYS RENDERED, NEVER CONDITIONAL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Participant's Own Video - ALWAYS EXISTS */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <div className="absolute top-2 left-2 text-white text-sm font-semibold z-10">
              You
            </div>
            
            {/* React placeholder - shows when no video */}
            <div 
              className="w-full h-full flex items-center justify-center text-gray-400"
              style={{ display: hasOwnVideo ? 'none' : 'flex' }}
            >
              <div className="text-center">
                <User className="mx-auto mb-2" size={48} />
                <p className="text-sm">Your Video</p>
              </div>
            </div>
            
            {/* VIDEO DIV - ALWAYS RENDERED */}
            <div
              ref={localVideoRef}
              className="w-full h-full absolute top-0 left-0"
              style={{ display: hasOwnVideo ? 'block' : 'none' }}
            />
          </div>

          {/* Host Video - ALWAYS EXISTS */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <div className="absolute top-2 left-2 text-white text-sm font-semibold z-10">
              Host
            </div>
            
            {/* React placeholder - shows when no video */}
            <div 
              className="w-full h-full flex items-center justify-center text-gray-400"
              style={{ display: hasHostVideo ? 'none' : 'flex' }}
            >
              <div className="text-center">
                <Users className="mx-auto mb-2" size={48} />
                <p className="text-sm">Waiting for host...</p>
              </div>
            </div>
            
            {/* VIDEO DIV - ALWAYS RENDERED */}
            <div
              ref={hostVideoRef}
              className="w-full h-full absolute top-0 left-0"
              style={{ display: hasHostVideo ? 'block' : 'none' }}
            />
          </div>
        </div>




        <div className="flex justify-center gap-4">
          <Button onClick={toggleAudio} variant="outline" size="lg">
            {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button onClick={toggleVideo} variant="outline" size="lg">
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
          <Button onClick={leaveCall} variant="destructive" size="lg">
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinCall;

import React, { useEffect, useRef, useState } from 'react';
import ZoomVideo from '@zoom/videosdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Copy, Check, User, Users } from 'lucide-react';

import { supabase } from '@/lib/supabase';

interface ZoomIntegrationProps {
  userName?: string;
  onTranscriptUpdate?: (transcript: string) => void;
  onCallStatusChange?: (isActive: boolean) => void;
  compact?: boolean; // For sidebar compact mode
  callDatabaseId?: string; // Database ID of the call to monitor
}



const ZoomIntegration: React.FC<ZoomIntegrationProps> = ({
  userName = 'Host',
  onTranscriptUpdate,
  onCallStatusChange,
  compact = false, // Default to false (full mode)
  callDatabaseId, // Database ID of the call to monitor
}) => {

  // CREATE REFS INTERNALLY - not from props
  const localVideoRef = useRef<HTMLDivElement>(null);
  const participantVideoRef = useRef<HTMLDivElement>(null);


  const [isInMeeting, setIsInMeeting] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participantJoined, setParticipantJoined] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  
  // NEW: Track when video elements are attached
  const [hasHostVideo, setHasHostVideo] = useState(false);
  const [hasParticipantVideo, setHasParticipantVideo] = useState(false);

  const clientRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const sessionNameRef = useRef<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [participantDisplayName, setParticipantDisplayName] = useState<string>('');




  // Verify refs are passed correctly
  useEffect(() => {
    console.log('📍 ZoomIntegration: Refs initialized:', {
      hasLocalRef: !!localVideoRef,
      hasLocalRefCurrent: !!localVideoRef?.current,
      hasParticipantRef: !!participantVideoRef,
      hasParticipantRefCurrent: !!participantVideoRef?.current,
      localRefType: localVideoRef?.current?.tagName,
      participantRefType: participantVideoRef?.current?.tagName,
    });
  }, [localVideoRef, participantVideoRef]);

  useEffect(() => {
    createAndJoinSession();
    
    // Listen for call ending in database
    let callEndSubscription: any = null;
    
    if (callDatabaseId) {
      console.log('📡 Setting up database listener for call:', callDatabaseId);
      callEndSubscription = supabase
        .channel('call-end-listener')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callDatabaseId}`
          },
          (payload) => {
            console.log('📡 Call status changed in database:', payload);
            if (payload.new.status === 'Completed') {
              console.log('✅ Call ended remotely, leaving session');
              leaveCall();
            }
          }
        )
        .subscribe();
    }
    
    // CRITICAL: Listen for endZoomCall event from LiveCall component
    const handleEndZoomCall = async (event: any) => {
      console.log('🔔 Received endZoomCall event:', event.detail);
      if (event.detail?.callId === callDatabaseId) {
        console.log('✅ Call ID matches, ending call with recording...');
        await leaveCall();
      }
    };
    
    window.addEventListener('endZoomCall', handleEndZoomCall);
    
    return () => {
      if (callEndSubscription) {
        callEndSubscription.unsubscribe();
      }
      window.removeEventListener('endZoomCall', handleEndZoomCall);
      if (clientRef.current) {
        clientRef.current.leave().catch(console.error);
      }
    };
  }, [callDatabaseId]);




  const createAndJoinSession = async () => {
    setIsInitializing(true);
    setError('');
    
    try {
      console.log('🔵 Host: Creating session...');
      const { data, error: fnError } = await supabase.functions.invoke('create-zoom-session', {
        body: { userName, role: 'host' }
      });

      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'Failed to create session');

      sessionNameRef.current = data.sessionName;
      setMeetingUrl(data.joinUrl);
      console.log('✅ Host: Session created:', data.sessionName);

      // Initialize Zoom Video SDK
      console.log('🔵 Host: Initializing SDK...');
      const client = ZoomVideo.createClient();
      clientRef.current = client;

      await client.init('en-US', 'CDN', {
        patchJsMedia: true,
        leaveOnPageUnload: true,
      });
      console.log('✅ Host: SDK initialized');

      // Join session
      console.log('🔵 Host: Joining session...');
      await client.join(data.sessionName, data.jwt, userName);
      console.log('✅ Host: Joined session');

      const stream = client.getMediaStream();
      streamRef.current = stream;

      // Start video first
      console.log('🔵 Host: Starting video...');
      await stream.startVideo();
      console.log('✅ Host: Video started');

      // Wait for video to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Render host's own video
      if (localVideoRef.current) {
        console.log('🔵 Host: Rendering own video...');
        
        try {
          const userId = client.getCurrentUserInfo().userId;
          console.log('Host userId:', userId);
          
          // Attach video - returns either canvas OR video element
          const videoElement = await stream.attachVideo(userId, 3);
          console.log('✅ Host: Element created:', videoElement?.tagName);

          if (!videoElement) {
            throw new Error('Failed to create video element');
          }

          // CRITICAL: Check if it's a canvas or video element
          const isCanvas = videoElement instanceof HTMLCanvasElement;
          const isVideo = videoElement.tagName === 'VIDEO' || videoElement.tagName === 'VIDEO-PLAYER';
          
          console.log('Element type check:', { isCanvas, isVideo, tagName: videoElement.tagName });

          if (isCanvas) {
            // It's a canvas - call renderVideo
            console.log('📹 Using canvas rendering method');
            await stream.renderVideo(
              videoElement,
              userId,
              localVideoRef.current.offsetWidth || 480,
              localVideoRef.current.offsetHeight || 360,
              0,
              0,
              3
            );
            console.log('✅ Host: Video rendered to canvas');
            
            // Append canvas directly
            localVideoRef.current.appendChild(videoElement);
            
          } else if (isVideo) {
            // It's a video element - just append directly, no renderVideo needed
            console.log('📹 Using video element method (no renderVideo needed)');
            
            // CRITICAL: Create video-player-container wrapper
            const container = document.createElement('video-player-container');
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.display = 'block';
            
            // Style the video element
            (videoElement as HTMLElement).style.width = '100%';
            (videoElement as HTMLElement).style.height = '100%';
            (videoElement as HTMLElement).style.objectFit = 'cover';
            
            // Put video inside container
            container.appendChild(videoElement);
            
            // Append container to ref
            localVideoRef.current.appendChild(container);
            
            console.log('✅ Host: Video element wrapped in container');
          } else {
            throw new Error('Unknown element type: ' + videoElement.tagName);
          }

          setHasHostVideo(true); // This makes the container visible
          console.log('✅ Host: Own video now visible');


          
          
        } catch (err: any) {
          console.error('❌ Host: Video render error:', err);
          setHasHostVideo(false); // Hide container, show React placeholder
        }
      } else {
        console.error('❌ Host: localVideoRef.current is null');
      }





      // Start audio after video
      console.log('🔵 Host: Starting audio...');
      await stream.startAudio();
      console.log('✅ Host: Audio started');
      
      // Set meeting as active
      setIsInMeeting(true);
      onCallStatusChange?.(true);
      console.log('✅ Host: Meeting is now active');

      // Start recording automatically
      await startRecording();



      // Setup event listener for participant video
      console.log('🔵 Host: Setting up participant video listener...');
      client.on('peer-video-state-change', handleParticipantVideoChange);
      
      // Also listen for user-added events to detect when participant joins
      client.on('user-added', async (payload: any) => {
        console.log('👥 Participant joined, userId:', payload.userId);
        
        // Get current host userId to exclude from search
        const hostUserId = clientRef.current.getCurrentUserInfo().userId;
        console.log('🔍 Host userId:', hostUserId);
        
        // Get ALL users from Zoom
        const allUsers = clientRef.current.getAllUser();
        console.log('🔍 All Zoom users:', allUsers);
        
        // Find the participant who just joined (EXCLUDE THE HOST)
        const joinedParticipant = allUsers.find((user: any) => 
          user.userId === payload.userId && user.userId !== hostUserId
        );
        
        console.log('🔍 Found participant (excluding host):', joinedParticipant);
        
        // Try multiple properties for the name
        const displayName = 
          joinedParticipant?.displayName || 
          joinedParticipant?.userName || 
          joinedParticipant?.userIdentity ||
          joinedParticipant?.screenName ||
          'Participant';
        
        console.log('🔍 Final display name:', displayName);
        
        setParticipantDisplayName(displayName);

        setShowConnectionAlert(true);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setShowConnectionAlert(false);
        }, 5000);
        
        // Notify LiveCall that participant connected with their name
        window.dispatchEvent(new CustomEvent('participantConnected', { 
          detail: { participantName: displayName }
        }));




        
        setParticipantJoined(true);




        
        // Wait a moment for their video to initialize
        setTimeout(async () => {
          console.log('🔵 Host: Checking if new participant has video...');
          const allUsers = client.getAllUser();
          
          for (const user of allUsers) {
            if (user.userId !== client.getCurrentUserInfo().userId) {
              console.log('Checking user:', user);
              
              // Check if they have video on
              if (user.bVideoOn) {
                console.log('🎥 Host: New participant has video on, rendering...');
                
                if (participantVideoRef.current && stream) {
                  try {
                    // Attach video - could be canvas or video element
                    const videoElement = await stream.attachVideo(user.userId, 3);
                    console.log('✅ New participant element created:', videoElement?.tagName);
                    
                    if (videoElement) {
                      // Check element type
                      const isCanvas = videoElement instanceof HTMLCanvasElement;
                      const isVideo = videoElement.tagName === 'VIDEO' || videoElement.tagName === 'VIDEO-PLAYER';
                      
                      if (isCanvas) {
                        // Canvas rendering
                        await stream.renderVideo(
                          videoElement,
                          user.userId,
                          participantVideoRef.current.offsetWidth || 480,
                          participantVideoRef.current.offsetHeight || 360,
                          0,
                          0,
                          3
                        );
                        // Append canvas directly
                        participantVideoRef.current.appendChild(videoElement);
                        
                      } else if (isVideo) {
                        // Video element - wrap in container
                        const container = document.createElement('video-player-container');
                        container.style.width = '100%';
                        container.style.height = '100%';
                        container.style.display = 'block';
                        
                        (videoElement as HTMLElement).style.width = '100%';
                        (videoElement as HTMLElement).style.height = '100%';
                        (videoElement as HTMLElement).style.objectFit = 'cover';
                        
                        container.appendChild(videoElement);
                        participantVideoRef.current.appendChild(container);
                      }
                      
                      setHasParticipantVideo(true);
                      console.log('✅ Host: New participant video rendered immediately');



                    }
                  } catch (err) {
                    console.error('❌ Host: Error rendering new participant video:', err);
                  }
                }

              }
            }
          }
        }, 1000);
      });
      

    } catch (err: any) {
      setError(err.message || 'Failed to initialize video');
      console.error('❌ Host: Zoom init error:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleParticipantVideoChange = async (payload: any) => {
    console.log('🎥 Host: Participant video event:', payload);
    
    // CRITICAL CHECK - Log exact ref status
    console.log('📍 Ref status when event fires:', {
      hasParticipantRef: !!participantVideoRef,
      hasParticipantRefCurrent: !!participantVideoRef?.current,
      hasStreamRef: !!streamRef.current,
      participantRefType: participantVideoRef?.current?.tagName,
      participantRefInnerHTML: participantVideoRef?.current?.innerHTML?.substring(0, 50),
    });
    
    if (!streamRef.current) {
      console.error('❌ streamRef.current is null!');
      return;
    }
    
    if (!participantVideoRef || !participantVideoRef.current) {
      console.error('❌ participantVideoRef is null or undefined!');
      console.error('participantVideoRef:', participantVideoRef);
      console.error('participantVideoRef.current:', participantVideoRef?.current);
      return;
    }

    if (payload.action === 'Start') {
      console.log('👤 Host: Participant started video, userId:', payload.userId);
      setParticipantJoined(true);
      
      try {
        // Attach participant's video - could be canvas or video element
        const videoElement = await streamRef.current.attachVideo(payload.userId, 3);
        console.log('✅ Host: Participant element created:', videoElement?.tagName);
        
        if (!videoElement) {
          throw new Error('Failed to create video element for participant');
        }

        // Check element type
        const isCanvas = videoElement instanceof HTMLCanvasElement;
        const isVideo = videoElement.tagName === 'VIDEO' || videoElement.tagName === 'VIDEO-PLAYER';
        
        console.log('Participant element type:', { isCanvas, isVideo, tagName: videoElement.tagName });

        if (isCanvas) {
          // Canvas rendering
          console.log('📹 Rendering participant to canvas');
          await streamRef.current.renderVideo(
            videoElement,
            payload.userId,
            participantVideoRef.current.offsetWidth || 480,
            participantVideoRef.current.offsetHeight || 360,
            0,
            0,
            3
          );
          console.log('✅ Host: Participant video rendered to canvas');
          
          // Append canvas directly
          participantVideoRef.current.appendChild(videoElement);
          
        } else if (isVideo) {
          // Video element - wrap in container
          console.log('📹 Participant using video element');
          
          // CRITICAL: Create video-player-container wrapper
          const container = document.createElement('video-player-container');
          container.style.width = '100%';
          container.style.height = '100%';
          container.style.display = 'block';
          
          (videoElement as HTMLElement).style.width = '100%';
          (videoElement as HTMLElement).style.height = '100%';
          (videoElement as HTMLElement).style.objectFit = 'cover';
          
          container.appendChild(videoElement);
          participantVideoRef.current.appendChild(container);
          
          console.log('✅ Host: Participant video element wrapped in container');
        }

        setHasParticipantVideo(true);
        console.log('✅ Host can now see participant video');


        
        
      } catch (err: any) {
        console.error('❌ Host: Error rendering participant video:', err);
        setHasParticipantVideo(false); // Hide container, show React placeholder
      }

    } else if (payload.action === 'Stop') {
      console.log('⏹️ Host: Participant stopped video');
      setHasParticipantVideo(false); // Hide container, show React placeholder
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
    console.log('🔴 leaveCall() called');
    console.log('🔴 isRecording state:', isRecording);
    console.log('🔴 mediaRecorderRef.current:', !!mediaRecorderRef.current);
    
    if (mediaRecorderRef.current) {
      console.log('🔴 mediaRecorderRef.current.state:', mediaRecorderRef.current.state);
      console.log('🔴 recordedChunksRef.current.length:', recordedChunksRef.current.length);
    }
    
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('🛑 Stopping recording via mediaRecorderRef...');
      await stopRecording();
    } else {
      console.log('⚠️ No active recording to stop');
    }

    // Leave the Zoom session
    if (clientRef.current) {
      try {
        await clientRef.current.leave(true);
        console.log('✅ Host ended session for all participants');
      } catch (error) {
        console.error('Error ending session:', error);
        await clientRef.current.leave();
      }
      setIsInMeeting(false);
      onCallStatusChange?.(false);
    }
  };




  const startRecording = async () => {
    console.log('🎥 Starting call recording (both host + participant audio)...');
    
    try {
      // Step 1: Get the user's microphone stream (host audio input)
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: false 
      });
      
      console.log('✅ Host microphone stream obtained');
      console.log('📊 Host audio tracks:', micStream.getAudioTracks().length);

      // Step 2: Create an audio context to mix streams
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      // Add host microphone to the mix
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);
      console.log('✅ Host microphone connected to mixer');

      // Step 3: Capture Zoom's audio output (participant audio)
      try {
        // Get display media with audio (this captures system audio including Zoom)
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // Need video to get the tab
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        
        console.log('✅ Display/tab capture stream obtained');
        
        // Get audio tracks from the display stream
        const displayAudioTracks = displayStream.getAudioTracks();
        
        if (displayAudioTracks.length > 0) {
          console.log('✅ Participant audio tracks found:', displayAudioTracks.length);
          
          // Add participant audio to the mix
          const displayAudioStream = new MediaStream(displayAudioTracks);
          const displaySource = audioContext.createMediaStreamSource(displayAudioStream);
          displaySource.connect(destination);
          console.log('✅ Participant audio connected to mixer');
        } else {
          console.warn('⚠️ No audio tracks in display stream - will record host only');
        }
        
        // Stop the video track immediately (we don't need it)
        displayStream.getVideoTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped display video track');
        });
        
      } catch (displayError) {
        console.warn('⚠️ Could not capture participant audio:', displayError.message);
        console.log('ℹ️ Continuing with host audio only');
      }

      // Step 4: Create MediaRecorder from the mixed stream
      const mixedStream = destination.stream;
      console.log('✅ Mixed audio stream created with', mixedStream.getAudioTracks().length, 'tracks');

      const recorder = new MediaRecorder(mixedStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          console.log('📦 Recorded chunk:', event.data.size, 'bytes, total chunks:', recordedChunksRef.current.length);
        }
      };

      recorder.onstop = async () => {
        console.log('🎥 Recording stopped, total chunks:', recordedChunksRef.current.length);
        
        // Stop all tracks and close audio context
        micStream.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped mic track');
        });
        
        if (audioContext.state !== 'closed') {
          await audioContext.close();
          console.log('🛑 Audio context closed');
        }
        
        await uploadRecording();
      };

      recorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // Collect data every second
      
      // CRITICAL: Set state AFTER recorder starts successfully
      setIsRecording(true);
      
      console.log('✅ Recording started successfully');
      console.log('📊 Recording state:', {
        hasRecorder: !!recorder,
        state: recorder.state,
        mimeType: recorder.mimeType,
        mixedTracks: mixedStream.getAudioTracks().length
      });
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      setIsRecording(false);
    }
  };





  const stopRecording = async () => {
    console.log('🛑 Stopping recording...');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('📹 MediaRecorder state before stop:', mediaRecorderRef.current.state);
      console.log('📦 Recorded chunks:', recordedChunksRef.current.length);
      
      // Stop the recorder - this will trigger onstop event which uploads
      mediaRecorderRef.current.stop();
      
      // Update state
      setIsRecording(false);
      
      console.log('✅ Recording stop called, waiting for onstop event...');
    } else {
      console.log('⚠️ MediaRecorder not active or missing');
    }
  };


  const uploadRecording = async () => {
    if (recordedChunksRef.current.length === 0) {
      console.warn('No recorded chunks to upload');
      return;
    }

    try {
      console.log('📤 Uploading recording...');
      
      // Update status to processing
      if (callDatabaseId) {
        await supabase
          .from('calls')
          .update({ recording_status: 'processing' })
          .eq('id', callDatabaseId);
      }

      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const filename = `call-${sessionNameRef.current}-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('call-recordings')
        .upload(filename, blob);

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        
        // Update status to failed
        if (callDatabaseId) {
          await supabase
            .from('calls')
            .update({ recording_status: 'failed' })
            .eq('id', callDatabaseId);
        }
        return;
      }

      console.log('✅ Recording uploaded successfully:', filename);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('call-recordings')
        .getPublicUrl(filename);

      if (callDatabaseId && urlData?.publicUrl) {
        const { error: updateError } = await supabase
          .from('calls')
          .update({ 
            recording_url: urlData.publicUrl,
            recording_status: 'available'
          })
          .eq('id', callDatabaseId);

        if (updateError) {
          console.error('❌ Error updating call record:', updateError);
        } else {
          console.log('✅ Call record updated with recording URL');
        }
      }

      recordedChunksRef.current = [];
    } catch (error) {
      console.error('❌ Error uploading recording:', error);
      
      // Update status to failed
      if (callDatabaseId) {
        await supabase
          .from('calls')
          .update({ recording_status: 'failed' })
          .eq('id', callDatabaseId);
      }
    }
  };




  const handleCopyLink = () => {
    navigator.clipboard.writeText(meetingUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="relative space-y-4">
      {/* BIG CONNECTION ALERT */}
      {showConnectionAlert && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in duration-300">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white text-center mb-2">
              Call Connected!
            </h2>
            <p className="text-xl text-white/90 text-center">
              {participantDisplayName} has joined
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              <span className="text-white/80 text-sm">Live</span>
            </div>
          </div>
        </div>
      )}


      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isInitializing && (
        <Alert>
          <AlertDescription>
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Initializing video call...</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Video Display - ALWAYS RENDERED, controlled by CSS display */}
      <div 
        className={compact ? 'space-y-3' : 'grid grid-cols-2 gap-4 mb-6'}
        style={{ display: isInMeeting ? 'grid' : 'none' }}
      >
        {/* Host Video - ALWAYS EXISTS */}
        <div className={`relative bg-gray-900 rounded-lg overflow-hidden aspect-video`}>
          <div className={`absolute ${compact ? 'top-1 left-1 text-xs' : 'top-2 left-2 text-sm'} text-white bg-black/70 px-2 py-0.5 rounded z-10`}>
            You (Host)
          </div>
          
          {/* React-managed placeholder - shows when no video */}
          <div 
            className="w-full h-full flex items-center justify-center text-gray-400"
            style={{ display: hasHostVideo ? 'none' : 'flex' }}
          >
            <div className="text-center">
              <User className="mx-auto mb-2" size={compact ? 24 : 48} />
              {!compact && <p className="text-sm">You</p>}
            </div>
          </div>
          
          {/* VIDEO DIV - ALWAYS RENDERED, ALWAYS HAS REF */}
          <div
            ref={localVideoRef}
            className="w-full h-full absolute top-0 left-0"
            style={{ display: hasHostVideo ? 'block' : 'none' }}
          />
          
          {hasHostVideo && !isVideoOff && streamRef.current && (
            <div className={`absolute ${compact ? 'top-1 right-1' : 'top-2 right-2'} bg-green-500 text-white ${compact ? 'text-xs px-1.5 py-0.5' : 'px-2 py-1'} rounded z-10`}>
              {compact ? '●' : 'Video On'}
            </div>
          )}
        </div>

        {/* Participant Video - ALWAYS EXISTS */}
        <div className={`relative bg-gray-900 rounded-lg overflow-hidden aspect-video`}>
          <div className={`absolute ${compact ? 'top-1 left-1 text-xs' : 'top-2 left-2 text-sm'} text-white bg-black/70 px-2 py-0.5 rounded z-10`}>
            {participantDisplayName || 'Participant'}
          </div>

          
          {/* React-managed placeholder - shows when no video */}
          <div 
            className="w-full h-full flex items-center justify-center text-gray-400"
            style={{ display: hasParticipantVideo ? 'none' : 'flex' }}
          >
            <div className="text-center">
              <Users className="mx-auto mb-2" size={compact ? 24 : 48} />
              {!compact && <p className="text-sm">Waiting for participant...</p>}
            </div>
          </div>
          
          {/* VIDEO DIV - ALWAYS RENDERED, ALWAYS HAS REF */}
          <div
            ref={participantVideoRef}
            className="w-full h-full absolute top-0 left-0"
            style={{ display: hasParticipantVideo ? 'block' : 'none' }}
          />
          
          {hasParticipantVideo && (
            <div className={`absolute ${compact ? 'top-1 right-1' : 'top-2 right-2'} bg-green-500 text-white ${compact ? 'text-xs px-1.5 py-0.5' : 'px-2 py-1'} rounded z-10`}>
              {compact ? '●' : 'Connected'}
            </div>
          )}
        </div>
      </div>





      {/* Localhost Warning */}
      {meetingUrl && meetingUrl.includes('localhost') && (
        <Alert className="border-orange-300 bg-orange-50">
          <AlertDescription>
            <strong>⚠️ Setup Required:</strong> Your meeting link uses "localhost" which only works on your computer.
            <br />
            <strong>To share with participants:</strong> You need to update the APP_URL in Supabase.
            <br />
            <a 
              href="https://supabase.com/dashboard" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Click here to open Supabase Dashboard
            </a>
            {' '}→ Select your project → Settings → Edge Functions → Add APP_URL variable
          </AlertDescription>
        </Alert>
      )}

      {/* Meeting Link and Connection Status Card - ALWAYS SHOW (removed !compact condition) */}
      {isInMeeting && meetingUrl && (

        <Card className="mb-3 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300">
          <CardContent className="pt-3 pb-3 space-y-2">
            {/* Meeting Link */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                <span>📋</span>
                <span>Share this link with participant:</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={meetingUrl}
                  readOnly
                  className="flex-1 px-2 py-1.5 text-xs border rounded bg-white font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button 
                  onClick={handleCopyLink} 
                  size="sm"
                  className="text-xs h-8"
                  variant={linkCopied ? 'default' : 'outline'}
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Connection Status - COMPACT */}
            <div className="border-t pt-2">
              <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                <span>🔌</span>
                <span>Connection Status:</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${streamRef.current ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="truncate">Your Video: {streamRef.current ? '✅' : '⏳'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!isAudioMuted && streamRef.current ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="truncate">Your Audio: {isAudioMuted ? '🔇' : '✅'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${participantJoined ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`}></div>
                  <span className="truncate">Participant: {participantJoined ? '✅' : '⏳'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasParticipantVideo ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="truncate">Their Video: {hasParticipantVideo ? '✅' : '⏳'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call Controls - ALWAYS SHOW (removed !compact condition) */}
      {isInMeeting && (

        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex gap-2 justify-center">
              <Button
                onClick={toggleVideo}
                variant={isVideoOff ? 'destructive' : 'outline'}
                size="sm"
                className="text-xs h-8 w-full"
                disabled={!streamRef.current}
              >
                {isVideoOff ? (
                  <>
                    <VideoOff className="h-3.5 w-3.5 mr-1" />
                    Start Video
                  </>
                ) : (
                  <>
                    <Video className="h-3.5 w-3.5 mr-1" />
                    Stop Video
                  </>
                )}
              </Button>
            </div>
            {participantJoined && (
              <p className="text-xs text-green-600 font-medium text-center mt-2">{participantDisplayName} joined</p>
            )}

          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ZoomIntegration;

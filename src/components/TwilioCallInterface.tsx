import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, PhoneOff, Mic, MicOff, MessageSquare, Voicemail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface TwilioCallInterfaceProps {
  candidateName: string;
  isRecording: boolean;
  onToggleRecording: () => void;
  onEndCall: () => void;
  onCallStarted?: () => void;
  onTranscriptUpdate: (transcript: string) => void;
}

const TwilioCallInterface: React.FC<TwilioCallInterfaceProps> = ({
  candidateName,
  isRecording,
  onToggleRecording,
  onEndCall,
  onCallStarted,
  onTranscriptUpdate
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDialing, setIsDialing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecordingVoicemail, setIsRecordingVoicemail] = useState(false);
  const [callStatus, setCallStatus] = useState<string>('');

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    isSupported
  } = useSpeechRecognition();

  // Update transcript when speech recognition changes
  useEffect(() => {
    if (transcript) {
      onTranscriptUpdate(transcript);
    }
  }, [transcript, onTranscriptUpdate]);

  const makeCall = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setIsDialing(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-call', {
        body: { 
          action: 'make_call',
          to: phoneNumber,
          callbackUrl: 'http://demo.twilio.com/docs/voice.xml'
        },
      });

      if (error) throw error;

      if (data.success) {
        setCallSid(data.callSid);
        setIsConnected(true);
        setCallStatus(data.status);
        onCallStarted?.();
        
        // Start speech recognition if supported
        if (isSupported) {
          startListening();
        }
      } else {
        throw new Error('Failed to initiate call');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make call');
    } finally {
      setIsDialing(false);
    }
  };

  const endCall = () => {
    stopListening();
    resetTranscript();
    setIsConnected(false);
    setCallSid(null);
    setCallStatus('');
    onEndCall();
  };

  const recordVoicemail = async () => {
    setIsRecordingVoicemail(true);
    // In a real implementation, this would trigger voicemail recording
    // For now, we'll simulate it
    setTimeout(() => {
      setIsRecordingVoicemail(false);
      alert('Voicemail recorded successfully!');
    }, 3000);
  };

  const sendSMS = async () => {
    if (!phoneNumber.trim()) {
      setError('No phone number available');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('twilio-call', {
        body: { 
          action: 'send_sms',
          to: phoneNumber,
          message: `Hi ${candidateName}, I tried calling you but couldn't reach you. Please call me back when you get a chance. Thanks!`
        },
      });

      if (error) throw error;

      if (data.success) {
        alert('SMS sent successfully!');
      } else {
        throw new Error('Failed to send SMS');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS');
    }
  };

  if (isConnected) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Phone className="mr-2 h-5 w-5 text-green-600" />
            Call Active - {candidateName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="h-10 w-10 text-green-600" />
              </div>
              <p className="font-medium text-lg">{candidateName}</p>
              <p className="text-sm text-gray-500">{phoneNumber}</p>
              <p className="text-xs text-gray-400">Status: {callStatus}</p>
              {callSid && (
                <p className="text-xs text-gray-400">Call ID: {callSid}</p>
              )}
            </div>
            
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={isListening ? stopListening : startListening}
                className={isListening ? 'bg-red-50 border-red-200' : 'bg-gray-50'}
                disabled={!isSupported}
              >
                {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                onClick={recordVoicemail}
                disabled={isRecordingVoicemail}
                className="bg-blue-50 border-blue-200"
              >
                <Voicemail className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                onClick={sendSMS}
                className="bg-yellow-50 border-yellow-200"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={endCall}
                className="bg-red-600 hover:bg-red-700"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                End Call
              </Button>
            </div>

            {isListening && isSupported && (
              <div className="text-center text-sm text-blue-600">
                🎤 Listening for speech...
              </div>
            )}

            {isRecordingVoicemail && (
              <div className="text-center text-sm text-red-600">
                🔴 Recording voicemail...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Phone className="mr-2 h-5 w-5 text-blue-600" />
          Call {candidateName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div>
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              disabled={isDialing}
            />
          </div>
          
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Ready to call {candidateName}
            </p>
            <Button
              onClick={makeCall}
              disabled={isDialing || !phoneNumber.trim()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Phone className="mr-2 h-4 w-4" />
              {isDialing ? 'Connecting...' : 'Start Call'}
            </Button>
          </div>

          {!isSupported && (
            <Alert>
              <AlertDescription className="text-xs">
                Speech recognition not supported. Use Chrome or Edge for transcription.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TwilioCallInterface;
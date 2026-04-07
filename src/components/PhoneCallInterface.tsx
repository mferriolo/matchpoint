import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';

interface PhoneCallInterfaceProps {
  candidateName: string;
  isRecording: boolean;
  onToggleRecording: () => void;
  onEndCall: () => void;
}

const PhoneCallInterface: React.FC<PhoneCallInterfaceProps> = ({
  candidateName,
  isRecording,
  onToggleRecording,
  onEndCall
}) => {
  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Phone className="mr-2 h-5 w-5 text-green-600" />
          Phone Call Interface
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Phone className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-medium">Connected to {candidateName}</p>
            <p className="text-sm text-gray-500">Phone call in progress</p>
          </div>
          
          <div className="flex justify-center gap-4">
            <Button
              variant="outline"
              onClick={onToggleRecording}
              className={isRecording ? 'bg-red-50 border-red-200' : 'bg-gray-50'}
            >
              {isRecording ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            
            <Button
              onClick={onEndCall}
              className="bg-red-600 hover:bg-red-700"
            >
              <PhoneOff className="mr-2 h-4 w-4" />
              End Call
            </Button>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg text-center">
            <p className="text-sm text-blue-700">
              💡 Use your phone to conduct the call. This interface provides AI prompting support.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PhoneCallInterface;
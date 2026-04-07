import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink } from 'lucide-react';

const SupabaseSetupInstructions: React.FC = () => {
  return (
    <Card className="border-orange-300 bg-orange-50">
      <CardHeader>
        <CardTitle className="text-orange-800 flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          One-Time Setup: Make Meeting Links Shareable
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <strong>Current Status:</strong> Meeting links use "localhost" which only works on your computer.
            <br />
            <strong>Goal:</strong> Update APP_URL so links work for anyone, anywhere.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Option 1: Use ngrok (Recommended for Testing)</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
            <li>
              <strong>Download ngrok:</strong>{' '}
              <a 
                href="https://ngrok.com/download" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                ngrok.com/download
              </a>
            </li>
            <li>
              <strong>Install ngrok:</strong>
              <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                <li>Mac: <code className="bg-gray-200 px-2 py-0.5 rounded">brew install ngrok</code></li>
                <li>Windows: Download, extract, and run ngrok.exe</li>
              </ul>
            </li>
            <li>
              <strong>Start ngrok:</strong> Run <code className="bg-gray-200 px-2 py-0.5 rounded">ngrok http 3000</code>
            </li>
            <li>
              <strong>Copy the https URL</strong> (example: https://abc123.ngrok-free.app)
            </li>
          </ol>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Option 2: Deploy Your App (For Production)</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
            <li>
              Deploy to{' '}
              <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Vercel
              </a>
              {' '}or{' '}
              <a href="https://netlify.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Netlify
              </a>
            </li>
            <li>Get your production URL (example: https://matchpoint.vercel.app)</li>
          </ol>
        </div>

        <div className="space-y-3 pt-2 border-t border-orange-200">
          <h3 className="font-semibold text-lg">Update Supabase with Your URL</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
            <li>
              Open{' '}
              <a 
                href="https://supabase.com/dashboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800 font-semibold"
              >
                Supabase Dashboard
              </a>
            </li>
            <li>Select your project</li>
            <li>Go to <strong>Settings</strong> (gear icon in sidebar)</li>
            <li>Click <strong>Edge Functions</strong></li>
            <li>Scroll to <strong>Secrets</strong> section</li>
            <li>Click <strong>Add new secret</strong></li>
            <li>
              Name: <code className="bg-gray-200 px-2 py-0.5 rounded">APP_URL</code>
            </li>
            <li>
              Value: Your ngrok or production URL (example: https://abc123.ngrok-free.app)
            </li>
            <li>Click <strong>Save</strong></li>
          </ol>
        </div>

        <Alert className="bg-green-50 border-green-300">
          <AlertDescription>
            <strong>✓ Done!</strong> Your meeting links will now work for anyone you share them with.
            Restart your call to generate a new shareable link.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default SupabaseSetupInstructions;

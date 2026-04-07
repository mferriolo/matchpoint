import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { Mail, Send, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';

const EmailTestSection = () => {
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const sendTestEmail = async () => {
    if (!testEmail) {
      setResult({
        success: false,
        message: 'Please enter an email address'
      });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      // Use the dedicated send-email function for testing
      const testSubject = 'Email Service Test - ' + new Date().toLocaleString();
      const testHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Service Test</h2>
          <p style="color: #555; line-height: 1.6;">
            This is a test email to verify that your Resend email service is configured correctly.
          </p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Test Time:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 10px 0 0 0;"><strong>Status:</strong> ✅ Email service is working</p>
          </div>
          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            This test email was sent from your CallCoach application to verify email functionality.
          </p>
        </div>
      `;

      console.log('Sending test email to:', testEmail);

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          subject: testSubject,
          html: testHtml
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setResult({
        success: true,
        message: `Test email sent successfully to ${testEmail}. Please check your inbox (and spam folder).`
      });
    } catch (error: any) {
      console.error('Email test error:', error);
      
      let errorMessage = 'Failed to send test email. ';
      
      if (error.message?.includes('RESEND_API_KEY')) {
        errorMessage += 'RESEND_API_KEY is not configured in Supabase edge function secrets.';
      } else if (error.message?.includes('Resend API error')) {
        errorMessage += 'Resend API error - check your API key and account status.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }
      
      setResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Service Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            Test your Resend email configuration to ensure emails are being delivered properly.
            This will send a test email to verify the email service is working.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label htmlFor="test-email">Test Email Address</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              disabled={sending}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the email address where you want to receive the test email
            </p>
          </div>

          <Button 
            onClick={sendTestEmail} 
            disabled={sending || !testEmail}
            className="w-full"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending Test Email...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Test Email
              </>
            )}
          </Button>
        </div>

        {result && (
          <Alert className={result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={result.success ? 'text-green-800' : 'text-red-800'}>
              {result.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="border-t pt-4">
          <h4 className="font-medium text-sm mb-3">Configuration Checklist:</h4>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs">1</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">Resend API Key</p>
                <p className="text-gray-600">Ensure RESEND_API_KEY is set in Supabase edge function secrets</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs">2</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">Resend Account</p>
                <p className="text-gray-600">Verify your Resend account is active at resend.com</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs">3</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">Check Spam Folder</p>
                <p className="text-gray-600">Test emails might go to spam initially</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs">4</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">Function Logs</p>
                <p className="text-gray-600">Check Supabase function logs for detailed error messages</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> The test will use the send-email function to send a test 
            email. This helps verify that your email integration is working properly for 
            all email communications.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailTestSection;
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Save, Settings, Video, Phone, Mail, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import EmailTestSection from './EmailTestSection';
import SupabaseSetupInstructions from '../SupabaseSetupInstructions';
import { useToast } from '@/hooks/use-toast';

interface Setting {
  key: string;
  value: any;
  description: string;
}


const SystemSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({
    'security.mfa_required': true,
    'security.session_timeout': 30,
    'notifications.email_enabled': true,
    'notifications.sms_enabled': true,
    'notifications.email_address': '',
    'notifications.phone_number': '',
    'data.retention_days': 365,
    'integrations.zoom_enabled': true,
    'integrations.twilio_enabled': true,
    'integrations.openai_api_key': '',
    'chatgpt.client_name_redact': true,
    // Outreach sender identity. Used by the script generator and the
    // Outreach Workspace so generated emails / call openers / LinkedIn
    // messages sign off as the actual user instead of "Best regards,
    // [your name]" placeholders.
    'outreach.sender_first_name': '',
    'outreach.sender_last_name': '',
    'outreach.sender_title': '',
    'outreach.sender_company': '',
  });

  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*');
    
    if (!error && data) {
      const settingsMap = data.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {});
      setSettings({ ...settings, ...settingsMap });
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    
    for (const [key, value] of Object.entries(settings)) {
      await supabase
        .from('system_settings')
        .upsert({
          key,
          value,
          description: getSettingDescription(key)
        });
    }
    
    setLoading(false);
  };

  const getSettingDescription = (key: string) => {
    const descriptions: Record<string, string> = {
      'security.mfa_required': 'Require multi-factor authentication',
      'security.session_timeout': 'Session timeout in minutes',
      'notifications.email_enabled': 'Enable email notifications',
      'notifications.sms_enabled': 'Enable SMS notifications',
      'notifications.email_address': 'Email address for notifications',
      'notifications.phone_number': 'Phone number for SMS notifications',
      'data.retention_days': 'Data retention period in days',
      'integrations.zoom_enabled': 'Enable Zoom integration',
      'integrations.twilio_enabled': 'Enable Twilio integration',
      'integrations.openai_api_key': 'OpenAI API key for AI features',
      'chatgpt.client_name_redact': 'Redact client names in ChatGPT prompts',
      'outreach.sender_first_name': 'Sender first name (used in generated outreach messages)',
      'outreach.sender_last_name': 'Sender last name (used in generated outreach messages)',
      'outreach.sender_title': 'Sender job title (used in generated outreach messages)',
      'outreach.sender_company': 'Sender company name (used in generated outreach messages)',
    };
    return descriptions[key] || '';
  };

  const updateSetting = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            System Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Security</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Require Multi-Factor Authentication</Label>
                <Switch 
                  checked={settings['security.mfa_required'] || false}
                  onCheckedChange={(checked) => updateSetting('security.mfa_required', checked)}
                />
              </div>
              <div>
                <Label>Session Timeout (minutes)</Label>
                <Input 
                  type="number"
                  value={settings['security.session_timeout'] || 30} 
                  onChange={(e) => updateSetting('security.session_timeout', parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-4">Notifications</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Email Notifications</Label>
                <Switch 
                  checked={settings['notifications.email_enabled'] || false}
                  onCheckedChange={(checked) => updateSetting('notifications.email_enabled', checked)}
                />
              </div>
              {settings['notifications.email_enabled'] && (
                <div>
                  <Label>Email Address</Label>
                  <Input 
                    type="email"
                    placeholder="notifications@company.com"
                    value={settings['notifications.email_address'] || ''} 
                    onChange={(e) => updateSetting('notifications.email_address', e.target.value)}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>SMS Notifications</Label>
                <Switch 
                  checked={settings['notifications.sms_enabled'] || false}
                  onCheckedChange={(checked) => updateSetting('notifications.sms_enabled', checked)}
                />
              </div>
              {settings['notifications.sms_enabled'] && (
                <div>
                  <Label>Phone Number</Label>
                  <Input 
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={settings['notifications.phone_number'] || ''} 
                    onChange={(e) => updateSetting('notifications.phone_number', e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-4">Outreach Sender</h3>
            <p className="text-sm text-gray-600 mb-4">
              Used to sign generated outreach messages so emails / call openers /
              LinkedIn notes go out under your name and title — no more "Best
              regards, [your name]" placeholders.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  placeholder="Matthew"
                  value={settings['outreach.sender_first_name'] || ''}
                  onChange={e => updateSetting('outreach.sender_first_name', e.target.value)}
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  placeholder="Ferriolo"
                  value={settings['outreach.sender_last_name'] || ''}
                  onChange={e => updateSetting('outreach.sender_last_name', e.target.value)}
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  placeholder="Managing Partner"
                  value={settings['outreach.sender_title'] || ''}
                  onChange={e => updateSetting('outreach.sender_title', e.target.value)}
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  placeholder="MedCentric"
                  value={settings['outreach.sender_company'] || ''}
                  onChange={e => updateSetting('outreach.sender_company', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          <GmailConnectionPanel />

          <Separator />

  <div>
    <h3 className="text-lg font-semibold mb-4">Integrations</h3>
    <div className="space-y-4">
      <div>
        <Label>OpenAI API Key</Label>
        <Input 
          type="password"
          placeholder="sk-..."
          value={settings['integrations.openai_api_key'] || ''} 
          onChange={(e) => updateSetting('integrations.openai_api_key', e.target.value)}
        />
        <p className="text-sm text-gray-600 mt-1">
          Required for AI features. Get your key from https://platform.openai.com/api-keys
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4" />
          <Label>Zoom Video SDK Setup</Label>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Setup Instructions
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Zoom Video SDK Setup</DialogTitle>
            </DialogHeader>
            <SupabaseSetupInstructions />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4" />
          <Label>Twilio Integration</Label>
        </div>
        <Button variant="outline" size="sm">
          Configure Twilio
        </Button>
      </div>
    </div>
  </div>


          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-4">ChatGPT Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Client Name Redact</Label>
                <Switch 
                  checked={settings['chatgpt.client_name_redact'] || false}
                  onCheckedChange={(checked) => updateSetting('chatgpt.client_name_redact', checked)}
                />
              </div>
              <p className="text-sm text-gray-600">
                When enabled, all ChatGPT instructions will include "redact the name of the company, and use 'Our Client' instead"
              </p>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={saveSettings} disabled={loading} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Email Test Section */}
      <EmailTestSection />
    </div>
  );
};

export default SystemSettings;

// =============================================================
// Gmail OAuth connection panel
// =============================================================
// Calls the gmail-oauth edge function for status / disconnect, and
// opens the OAuth start endpoint in a popup. We poll status until the
// user finishes the consent dance in the popup, then refresh the
// displayed connection state. Single-tenant for now: shows whichever
// gmail account is currently stored.
function GmailConnectionPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<{ email: string; updated_at?: string } | null>(null);

  const refreshStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      if (data?.connected) setConnected({ email: data.email, updated_at: data.updated_at });
      else setConnected(null);
    } catch (e: any) {
      console.warn('gmail status:', e?.message || e);
      setConnected(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshStatus(); }, []);

  // Surface the post-redirect query (gmail=connected | gmail=error)
  // that gmail-oauth's callback uses on its way back into the app.
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('gmail');
    if (!status) return;
    if (status === 'connected') {
      const email = url.searchParams.get('email') || '';
      toast({ title: 'Gmail connected', description: email ? `Sending as ${email}` : 'Ready to send.' });
    } else if (status === 'error') {
      const reason = url.searchParams.get('reason') || 'unknown';
      toast({
        title: 'Gmail connection failed',
        description: `Google returned: ${reason}. Check the Cloud Console redirect URI matches the one in the function logs.`,
        variant: 'destructive',
      });
    }
    // Strip the params so a refresh doesn't re-fire the toast.
    url.searchParams.delete('gmail');
    url.searchParams.delete('email');
    url.searchParams.delete('reason');
    window.history.replaceState({}, '', url.toString());
    refreshStatus();
  }, []);

  const startConnect = () => {
    // Build the start URL on the function host. The function 302s to
    // Google; Google 302s back to ?action=callback; the callback 302s
    // the user back to APP_URL with ?gmail=connected. We open in the
    // current tab so the redirects flow naturally — no popup window
    // gymnastics or postMessage needed.
    // The Supabase URL is hardcoded in src/lib/supabase.ts (same place
    // anywhere else in the app uses it), so we mirror it here rather
    // than read it via private supabase-js internals.
    setConnecting(true);
    const startUrl = `https://nrnmzvenwjqsnegxyaxz.supabase.co/functions/v1/gmail-oauth?action=start`;
    window.location.assign(startUrl);
  };

  const disconnect = async () => {
    if (!connected?.email) return;
    if (!window.confirm(`Disconnect Gmail (${connected.email})? Future "Send via Gmail" buttons will fall back to mailto: until you reconnect.`)) return;
    try {
      const { error } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'disconnect', email: connected.email },
      });
      if (error) throw error;
      toast({ title: 'Gmail disconnected' });
      setConnected(null);
    } catch (e: any) {
      toast({ title: 'Disconnect failed', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Mail className="w-4 h-4 text-[#911406]" />
        Gmail Connection
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Connect a Gmail account so the outreach <strong>Send via Gmail</strong> button can send HTML
        emails directly from your inbox — preserving the role-title hyperlink without
        needing to copy-paste into compose.
      </p>
      {loading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
        </div>
      ) : connected ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{connected.email}</div>
              <div className="text-[11px] text-gray-500">
                Connected{connected.updated_at ? ` · updated ${new Date(connected.updated_at).toLocaleString()}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={refreshStatus}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={disconnect} className="text-red-700 border-red-300 hover:bg-red-50">
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <XCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <div className="text-sm text-gray-700">No Gmail account connected.</div>
          </div>
          <Button size="sm" onClick={startConnect} disabled={connecting} className="bg-[#911406] hover:bg-[#7a1005] text-white">
            {connecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            Connect Gmail
          </Button>
        </div>
      )}
      <p className="text-[11px] text-gray-500 mt-2">
        Requires <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, and{' '}
        <code>APP_URL</code> set as Supabase function secrets, plus the redirect URI{' '}
        <code className="break-all">/functions/v1/gmail-oauth?action=callback</code> registered
        in Google Cloud Console. See <code>docs/gmail-setup.md</code> for the full setup.
      </p>
    </div>
  );
}
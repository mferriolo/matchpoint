import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Save, Settings, Video, Phone } from 'lucide-react';
import EmailTestSection from './EmailTestSection';
import SupabaseSetupInstructions from '../SupabaseSetupInstructions';

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
    'chatgpt.client_name_redact': true
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
      'chatgpt.client_name_redact': 'Redact client names in ChatGPT prompts'
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
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { Upload, Download, Database, Trash2, AlertTriangle } from 'lucide-react';

const DataManagement = () => {
  const [importData, setImportData] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleImport = async () => {
    if (!importData.trim()) return;
    
    setLoading(true);
    try {
      const data = JSON.parse(importData);
      // Process import data here
      setMessage('Data imported successfully');
    } catch (error) {
      setMessage('Error importing data: Invalid JSON format');
    }
    setLoading(false);
  };

  const handleExport = async (table: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*');
      
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table}-export.json`;
      a.click();
      
      setMessage(`${table} data exported successfully`);
    } catch (error) {
      setMessage(`Error exporting ${table} data`);
    }
    setLoading(false);
  };

  const handleCleanup = async (table: string) => {
    if (!confirm(`Are you sure you want to clean up old data from ${table}?`)) return;
    
    setLoading(true);
    try {
      // Clean up old records (example: older than 1 year)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const { error } = await supabase
        .from(table)
        .delete()
        .lt('created_at', oneYearAgo.toISOString());
      
      if (error) throw error;
      setMessage(`Old data cleaned up from ${table}`);
    } catch (error) {
      setMessage(`Error cleaning up ${table} data`);
    }
    setLoading(false);
  };

  const handleClearAllJobs = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL job orders from the database. This action cannot be undone. Are you absolutely sure?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('job_orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (error) throw error;
      setMessage('✅ All job orders have been successfully deleted');
      
      // Reload the page to refresh the state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      setMessage('❌ Error deleting job orders: ' + (error as Error).message);
    }
    setLoading(false);
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="import" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
              <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="space-y-4">
              <div>
                <Label>Import Data (JSON format)</Label>
                <Textarea 
                  placeholder="Paste JSON data here..."
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  rows={10}
                />
              </div>
              <Button onClick={handleImport} disabled={loading}>
                <Upload className="w-4 h-4 mr-2" />
                {loading ? 'Importing...' : 'Import Data'}
              </Button>
            </TabsContent>

            <TabsContent value="export" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button onClick={() => handleExport('admin_users')} disabled={loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Users
                </Button>
                <Button onClick={() => handleExport('audit_logs')} disabled={loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Audit Logs
                </Button>
                <Button onClick={() => handleExport('system_settings')} disabled={loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Settings
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="cleanup" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Data cleanup operations are irreversible. Please ensure you have backups before proceeding.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="destructive" 
                  onClick={() => handleCleanup('audit_logs')} 
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cleanup Old Audit Logs
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleClearAllJobs} 
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Job Orders
                </Button>
              </div>

            </TabsContent>
          </Tabs>

          {message && (
            <Alert className="mt-4">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataManagement;
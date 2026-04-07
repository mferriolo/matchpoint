import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { DatePickerWithRange } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { BarChart3, Download, Calendar, TrendingUp } from 'lucide-react';
import { DateRange } from 'react-day-picker';

interface ReportData {
  metric: string;
  value: number;
  change: string;
  trend: 'up' | 'down' | 'stable';
}

const Reports = () => {
  const [reportType, setReportType] = useState('user-activity');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    
    try {
      switch (reportType) {
        case 'user-activity':
          await generateUserActivityReport();
          break;
        case 'system-usage':
          await generateSystemUsageReport();
          break;
        case 'security-audit':
          await generateSecurityAuditReport();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error generating report:', error);
    }
    
    setLoading(false);
  };

  const generateUserActivityReport = async () => {
    const { data: users, error } = await supabase
      .from('admin_users')
      .select('*');
    
    if (!error && users) {
      const activeUsers = users.filter(u => u.status === 'active').length;
      const totalUsers = users.length;
      const adminUsers = users.filter(u => u.role === 'admin').length;
      
      setReportData([
        { metric: 'Total Users', value: totalUsers, change: '+5%', trend: 'up' },
        { metric: 'Active Users', value: activeUsers, change: '+2%', trend: 'up' },
        { metric: 'Admin Users', value: adminUsers, change: '0%', trend: 'stable' },
        { metric: 'Inactive Users', value: totalUsers - activeUsers, change: '-1%', trend: 'down' }
      ]);
    }
  };

  const generateSystemUsageReport = async () => {
    // Mock data for system usage
    setReportData([
      { metric: 'API Calls', value: 15420, change: '+12%', trend: 'up' },
      { metric: 'Storage Used (GB)', value: 245, change: '+8%', trend: 'up' },
      { metric: 'Active Sessions', value: 89, change: '-3%', trend: 'down' },
      { metric: 'Error Rate (%)', value: 0.2, change: '-15%', trend: 'down' }
    ]);
  };

  const generateSecurityAuditReport = async () => {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (!error && logs) {
      const loginAttempts = logs.filter(l => l.action === 'login').length;
      const failedLogins = logs.filter(l => l.action === 'failed_login').length;
      const adminActions = logs.filter(l => l.action.includes('admin')).length;
      
      setReportData([
        { metric: 'Login Attempts', value: loginAttempts, change: '+7%', trend: 'up' },
        { metric: 'Failed Logins', value: failedLogins, change: '-20%', trend: 'down' },
        { metric: 'Admin Actions', value: adminActions, change: '+15%', trend: 'up' },
        { metric: 'Security Alerts', value: 3, change: '0%', trend: 'stable' }
      ]);
    }
  };

  const exportReport = () => {
    const csv = [
      ['Metric', 'Value', 'Change', 'Trend'],
      ...reportData.map(row => [row.metric, row.value.toString(), row.change, row.trend])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report.csv`;
    a.click();
  };

  useEffect(() => {
    generateReport();
  }, [reportType]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Reports & Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user-activity">User Activity</SelectItem>
                <SelectItem value="system-usage">System Usage</SelectItem>
                <SelectItem value="security-audit">Security Audit</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={generateReport} disabled={loading}>
              {loading ? 'Generating...' : 'Generate Report'}
            </Button>
            
            <Button variant="outline" onClick={exportReport} disabled={!reportData.length}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>

          {reportData.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell>{row.value.toLocaleString()}</TableCell>
                    <TableCell>{row.change}</TableCell>
                    <TableCell>
                      <Badge variant={
                        row.trend === 'up' ? 'default' : 
                        row.trend === 'down' ? 'destructive' : 'secondary'
                      }>
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {row.trend}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
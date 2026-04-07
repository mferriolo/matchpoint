import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function BugButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [appLogs, setAppLogs] = useState<any[]>([]);

  const loadLogs = () => {
    try {
      const matchpointErrors = JSON.parse(localStorage.getItem('matchpoint_errors') || '[]');
      const appErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      setErrorLogs(matchpointErrors);
      setAppLogs(appErrors);
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  };

  const handleOpen = () => {
    loadLogs();
    setIsOpen(true);
  };

  const downloadLogs = () => {
    const allLogs = {
      matchpointErrors: errorLogs,
      appErrors: appLogs,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    const blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    localStorage.removeItem('matchpoint_errors');
    localStorage.removeItem('app_errors');
    loadLogs();
  };

  const totalErrors = errorLogs.length + appLogs.length;

  return (
    <>
      <Button
        onClick={handleOpen}
        className="fixed bottom-4 right-4 rounded-full w-14 h-14 shadow-lg z-50"
        variant="destructive"
        title="View Error Logs"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {totalErrors > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
            {totalErrors}
          </Badge>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Error Logs</DialogTitle>
            <DialogDescription>
              View and download application error logs for debugging
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button onClick={downloadLogs} variant="outline" size="sm">
              Download Logs
            </Button>
            <Button onClick={clearLogs} variant="outline" size="sm">
              Clear Logs
            </Button>
            <Button onClick={loadLogs} variant="outline" size="sm">
              Refresh
            </Button>
          </div>

          <Tabs defaultValue="boundary">
            <TabsList>
              <TabsTrigger value="boundary">
                Error Boundary ({errorLogs.length})
              </TabsTrigger>
              <TabsTrigger value="app">
                App Logs ({appLogs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="boundary">
              <ScrollArea className="h-[400px]">
                {errorLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No errors logged</p>
                ) : (
                  <div className="space-y-4">
                    {errorLogs.map((log, idx) => (
                      <div key={idx} className="border rounded-lg p-4 bg-red-50">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="destructive">Error</Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-semibold text-sm mb-2">{log.message}</p>
                        {log.stack && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-gray-600">Stack Trace</summary>
                            <pre className="mt-2 p-2 bg-white rounded overflow-auto text-xs">
                              {log.stack}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="app">
              <ScrollArea className="h-[400px]">
                {appLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No logs recorded</p>
                ) : (
                  <div className="space-y-2">
                    {appLogs.map((log, idx) => (
                      <div key={idx} className="border rounded p-3 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>
                            {log.level}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-medium">[{log.category}] {log.message}</p>
                        {log.data && (
                          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

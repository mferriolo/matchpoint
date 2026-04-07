import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserManagement from '@/components/admin/UserManagement';
import SystemSettings from '@/components/admin/SystemSettings';
import DataManagement from '@/components/admin/DataManagement';
import { JobTypeManagement } from '@/components/admin/JobTypeManagement';
import { JobOrderQuestionsManagement } from '@/components/admin/JobOrderQuestionsManagement';
import { StandardJobOrderQuestionsManagement } from '@/components/admin/StandardJobOrderQuestionsManagement';
import { CallTypeManagement } from '@/components/admin/CallTypeManagement';
import AIManagement from '@/components/admin/AIManagement';
import MasterSkillsManagement from '@/components/admin/MasterSkillsManagement';
import JobTypesManagement from '@/components/admin/JobTypesManagement';
import { InterviewQuestionsManagement } from '@/components/admin/InterviewQuestionsManagement';
import MarketingSearchSettings from '@/components/admin/MarketingSearchSettings';

const Admin = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761676387442_b759d2c1.jpg" 
              alt="MatchPoint Logo" 
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
              <p className="text-gray-600 mt-2">Manage users, system settings, and data</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>

        <Tabs defaultValue="ai" className="space-y-6">

          <div className="border-b border-gray-200 pb-4 mb-2">
            <TabsList className="flex w-full gap-6 bg-transparent h-auto p-0 flex-wrap">
              {/* UTILITIES - Grey */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Utilities</span>
                <div className="flex gap-1">
                  <TabsTrigger value="ai" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">AI Prompts</TabsTrigger>
                  <TabsTrigger value="call-types" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">Call Types</TabsTrigger>
                  <TabsTrigger value="skills" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">Skills</TabsTrigger>
                  <TabsTrigger value="data" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">Data</TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">Settings</TabsTrigger>
                  <TabsTrigger value="users" className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-md">Users</TabsTrigger>
                </div>
              </div>
              
              {/* CANDIDATES - Green */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Candidates</span>
                <div className="flex gap-1">
                  <TabsTrigger value="interview-questions" className="text-xs px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 data-[state=active]:bg-green-600 data-[state=active]:text-white rounded-md">Candidate Q's</TabsTrigger>
                </div>
              </div>
              
              {/* JOBS/CLIENTS - Red */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">Jobs/Clients</span>
                <div className="flex gap-1">
                  <TabsTrigger value="job-types" className="text-xs px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-md">Job Types</TabsTrigger>
                  <TabsTrigger value="standard-job-order-questions" className="text-xs px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-md">JO DEFAULT Q's</TabsTrigger>
                  <TabsTrigger value="job-order-questions" className="text-xs px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-md">JO Q's by Type</TabsTrigger>
                </div>
              </div>

              {/* MARKETING - Blue */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">Marketing</span>
                <div className="flex gap-1">
                  <TabsTrigger value="marketing-settings" className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md">Job Search Settings</TabsTrigger>
                </div>
              </div>
            </TabsList>
          </div>

          <TabsContent value="settings">
            <SystemSettings />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="job-types">
            <JobTypesManagement />
          </TabsContent>

          <TabsContent value="interview-questions">
            <InterviewQuestionsManagement />
          </TabsContent>
          
          <TabsContent value="standard-job-order-questions">
            <StandardJobOrderQuestionsManagement />
          </TabsContent>
          
          <TabsContent value="job-order-questions">
            <JobOrderQuestionsManagement />
          </TabsContent>

          <TabsContent value="call-types">
            <CallTypeManagement />
          </TabsContent>

          <TabsContent value="skills">
            <MasterSkillsManagement />
          </TabsContent>

          <TabsContent value="ai">
            <AIManagement />
          </TabsContent>

          <TabsContent value="data">
            <DataManagement />
          </TabsContent>

          <TabsContent value="marketing-settings">
            <MarketingSearchSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;

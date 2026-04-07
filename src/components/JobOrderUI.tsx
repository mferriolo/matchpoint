import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw, Save } from 'lucide-react';

export const JobOrderHeader = ({ handleSaveChanges, isSaving, generateJobOrder, loading, hasGenerated, handleGenerateGapQuestions }) => (
  <div className="flex items-center justify-between">
    <h2 className="text-2xl font-bold text-gray-900 flex items-center">
      <FileText className="mr-2 h-6 w-6" />
      Job Order
    </h2>
    <div className="flex gap-2">
      <Button 
        onClick={handleSaveChanges}
        disabled={isSaving}
        className="flex items-center bg-green-600 hover:bg-green-700"
      >
        <Save className={`mr-2 h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>
      <Button 
        onClick={generateJobOrder} 
        disabled={loading}
        className="flex items-center"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Generating...' : hasGenerated ? 'Regenerate' : 'Generate'}
      </Button>
      <Button
        variant="outline"
        onClick={handleGenerateGapQuestions}
        disabled={loading}
        className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
      >
        {loading ? (
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        Add Insight
      </Button>
    </div>
  </div>
);

export const renderQuestionTableWithNotes = (title: string, questions: string[], answers: { [key: string]: string }, notes: string, onAnswerChange: (question: string, value: string) => void, loading: boolean, hasGenerated: boolean) => (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle className="text-lg font-semibold text-gray-800">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 p-3 text-left font-semibold">Question</th>
              <th className="border border-gray-300 p-3 text-left font-semibold">Answer</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}>
                 <td className="border border-gray-300 p-3 font-medium text-gray-700 w-1/2">
                   {question}
                 </td>
                 <td className="border border-gray-300 p-3 text-gray-600">
                   {loading && hasGenerated ? (
                     'Thinking...'
                   ) : hasGenerated ? (
                      <textarea
                        value={answers[question] || 'Not Specified'}
                        onChange={(e) => onAnswerChange(question, e.target.value)}
                        className="w-full min-h-[60px] p-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      />
                   ) : (
                     ''
                   )}
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <h4 className="font-semibold text-blue-800 mb-2">NOTES:</h4>
          <p className="text-blue-700">{notes}</p>
        </div>
      )}
    </CardContent>
  </Card>
);

export const UnansweredQuestionsSection = ({ jobOrderData, handleGenerateGapQuestions, loading }) => (
  (jobOrderData.unansweredQuestions.insightful.length > 0 || jobOrderData.unansweredQuestions.job.length > 0 || jobOrderData.unansweredQuestions.company.length > 0 || jobOrderData.unansweredQuestions.hiring.length > 0) && (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-red-700 flex items-center justify-between">
          Unanswered Questions
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateGapQuestions}
            disabled={loading}
            className="text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            {loading ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Add Insight
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {jobOrderData.unansweredQuestions.insightful.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-blue-800 mb-2">Insightful Questions:</h4>
            <div className="space-y-2">
              {jobOrderData.unansweredQuestions.insightful.map((question, index) => (
                <div key={index} className="p-2 bg-blue-50 border border-blue-200 rounded">
                  <span className="text-blue-800 font-medium">{index + 1}. </span>
                  <span className="text-blue-700">{question}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {jobOrderData.unansweredQuestions.job.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-red-800 mb-2">About the Job:</h4>
            <div className="space-y-2">
              {jobOrderData.unansweredQuestions.job.map((question, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-800 font-medium">{index + 1}. </span>
                  <span className="text-red-700">{question}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {jobOrderData.unansweredQuestions.company.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-red-800 mb-2">About the Company:</h4>
            <div className="space-y-2">
              {jobOrderData.unansweredQuestions.company.map((question, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-800 font-medium">{index + 1}. </span>
                  <span className="text-red-700">{question}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {jobOrderData.unansweredQuestions.hiring.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-red-800 mb-2">About the Hiring Process:</h4>
            <div className="space-y-2">
              {jobOrderData.unansweredQuestions.hiring.map((question, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-800 font-medium">{index + 1}. </span>
                  <span className="text-red-700">{question}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
);
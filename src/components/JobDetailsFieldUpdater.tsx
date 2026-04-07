import { useEffect } from 'react';
import { Job } from '@/types/callprompt';
import { supabase } from '@/lib/supabase';

interface JobDetailsFieldUpdaterProps {
  job: Job;
  updateEditData: (updates: any) => void;
}

const JobDetailsFieldUpdater: React.FC<JobDetailsFieldUpdaterProps> = ({ job, updateEditData }) => {
  
  const generateJobSummary = async (jobData: any): Promise<string> => {
    try {
      // Generate summary using job questions and description
      const jobQuestions = jobData.jobQuestions || {};
      const description = job.jobDescription || job.description || '';
      
      // Build a compelling summary from available data
      const keyPoints = [];
      
      // Add role overview
      if (job.title) {
        keyPoints.push(`This ${job.title} position offers an exciting opportunity to make a meaningful impact in healthcare.`);
      }
      
      // Add location if available
      if (job.location && job.location !== 'Not Specified') {
        keyPoints.push(`Located in ${job.location}, this role provides an excellent work environment.`);
      }
      
      // Add compensation if available
      const compensationAnswer = jobQuestions['What is the compensation structure?'] || 
                                jobQuestions['What is the salary range?'];
      if (compensationAnswer && compensationAnswer !== 'Not Specified') {
        keyPoints.push(`Competitive compensation package included.`);
      }
      
      // Add benefits if mentioned
      const benefitsAnswer = jobQuestions['What benefits are offered?'];
      if (benefitsAnswer && benefitsAnswer !== 'Not Specified') {
        keyPoints.push(`Comprehensive benefits package available.`);
      }
      
      // Create two paragraphs
      const firstParagraph = keyPoints.slice(0, Math.ceil(keyPoints.length / 2)).join(' ') || 
        `This ${job.title} position offers an exciting opportunity to make a meaningful impact in healthcare. The role combines professional growth with the chance to work in a dynamic environment that values innovation and excellence.`;
      
      const secondParagraph = keyPoints.slice(Math.ceil(keyPoints.length / 2)).join(' ') || 
        `With competitive compensation and comprehensive benefits, this position is ideal for professionals seeking to advance their career while contributing to important healthcare initiatives. Join a team that prioritizes both professional development and work-life balance.`;
      
      return `${firstParagraph}\n\n${secondParagraph}`;
    } catch (error) {
      console.error('Error generating job summary:', error);
      return `This ${job.title} position offers an exciting opportunity to make a meaningful impact in healthcare. The role combines professional growth with the chance to work in a dynamic environment that values innovation and excellence.\n\nWith competitive compensation and comprehensive benefits, this position is ideal for professionals seeking to advance their career while contributing to important healthcare initiatives. Join a team that prioritizes both professional development and work-life balance.`;
    }
  };

  useEffect(() => {
    const handleJobOrderUpdate = async () => {
      const jobOrderData = localStorage.getItem(`jobOrder_${job.id}`);
      if (jobOrderData) {
        try {
          const parsed = JSON.parse(jobOrderData);
          const jobQuestions = parsed.jobQuestions || {};
          const updates: any = {};
          
          // Generate compelling job summary if not already set or if it's placeholder text
          const currentSummary = job.summary || '';
          const currentDescription = job.description || '';
          const isPlaceholderSummary = !currentSummary || 
            currentSummary.includes('Not Specified') || 
            currentSummary.length < 100 || 
            currentSummary === 'Job description not provided.' || 
            currentSummary.includes('Job Description') ||
            currentSummary === currentDescription || // If summary is same as job description
            currentSummary === job.jobDescription; // If summary is same as raw job description
            
          if (isPlaceholderSummary) {
            const summary = await generateJobSummary(parsed);
            updates.summary = summary;
          }
          // Extract compensation with better parsing
          const compensationQuestions = [
            'What is the compensation structure?',
            'Are there any bonuses or incentives?',
            'What is the salary range?',
            'What is the hourly rate?'
          ];
          
          for (const question of compensationQuestions) {
            const answer = jobQuestions[question];
            console.log(`Checking compensation question "${question}": ${answer}`);
            if (answer && answer !== 'Not Specified' && answer.trim() !== '' && (!job.compensation || job.compensation === 'Not Specified' || job.compensation === 'Not specified')) {
              console.log(`Found compensation answer for "${question}": ${answer}`);
              
              // Enhanced parsing for salary ranges like "180-225K", "$180K-$225K", "180,000-225,000"
              // More aggressive regex to catch various formats including "180-225K"
              const rangeMatch = answer.match(/(\d+)(?:,\d{3})*(?:k|K)?\s*[-–—to]\s*(\d+)(?:,\d{3})*(?:k|K)?/i) || 
                                answer.match(/\$?(\d+)(?:,\d{3})*\s*[-–—to]\s*\$?(\d+)(?:,\d{3})*/i) ||
                                answer.match(/(\d+)(?:k|K)\s*[-–—to]\s*(\d+)(?:k|K)/i) ||
                                answer.match(/(\d+)\s*[-–—]\s*(\d+)(?:k|K)/i);
              
              if (rangeMatch) {
                let min = parseInt(rangeMatch[1].replace(/[$,]/g, ''));
                let max = parseInt(rangeMatch[2].replace(/[$,]/g, ''));
                
                // Handle K notation - if the original string contains K, multiply by 1000
                const originalAnswer = answer.toLowerCase();
                if (originalAnswer.includes('k') && (min < 1000 || max < 1000)) {
                  if (min < 1000) min *= 1000;
                  if (max < 1000) max *= 1000;
                }
                
                const average = Math.round((min + max) / 2);
                updates.compensation = `$${average.toLocaleString()}`;
                console.log(`Parsed range compensation: ${updates.compensation} (from ${min} to ${max})`);
                break;
              } 
              
              // Try single values with K notation
              const singleKMatch = answer.match(/\$?([\d,]+)k/i);
              if (singleKMatch) {
                let value = parseInt(singleKMatch[1].replace(/,/g, ''));
                value *= 1000; // Always multiply by 1000 for K notation
                updates.compensation = `$${value.toLocaleString()}`;
                console.log(`Parsed single K compensation: ${updates.compensation}`);
                break;
              }
              
              // Try regular single salary values
              const singleMatch = answer.match(/\$?([\d,]+)/);
              if (singleMatch) {
                let value = parseInt(singleMatch[1].replace(/,/g, ''));
                // Only multiply by 1000 if it's clearly in thousands format and less than 1000
                if (value < 1000 && (answer.toLowerCase().includes('k') || answer.includes('K'))) {
                  value *= 1000;
                }
                updates.compensation = `$${value.toLocaleString()}`;
                console.log(`Parsed single compensation: ${updates.compensation}`);
                break;
              }
              
              // Fallback: use raw answer if it looks like compensation
              if (answer.includes('$') || answer.toLowerCase().includes('salary') || answer.toLowerCase().includes('k')) {
                updates.compensation = answer;
                console.log(`Using raw compensation: ${updates.compensation}`);
                break;
              }
            }
          }
          
          // Extract start date with better parsing
          const startDateQuestions = [
            'What is the expected start date?',
            'What is the target start date?',
            'When do you need this position filled?'
          ];
          
          for (const question of startDateQuestions) {
            const answer = jobQuestions[question];
            if (answer && answer !== 'Not Specified' && !job.startDate) {
              const dateMatch = answer.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                updates.startDate = dateMatch[0];
                break;
              } else if (answer.toLowerCase().includes('immediate') || answer.toLowerCase().includes('asap')) {
                updates.startDate = new Date().toISOString().split('T')[0];
                break;
              }
            }
          }
          
          // Extract number of openings
          const openingsQuestions = [
            'How many positions are you looking to fill?',
            'Number of openings?',
            'How many hires?'
          ];
          
          for (const question of openingsQuestions) {
            const answer = jobQuestions[question];
            if (answer && answer !== 'Not Specified') {
              const numberMatch = answer.match(/(\d+)/);
              if (numberMatch) {
                updates.numberOfOpenings = parseInt(numberMatch[1]);
                break;
              }
            }
          }
          
          // Extract location details from job location or questions
          const locationQuestions = [
            'What is the work location?',
            'Where is this position located?',
            'What is the address?'
          ];
          
          let locationInfo = job.location || '';
          for (const question of locationQuestions) {
            const answer = jobQuestions[question];
            if (answer && answer !== 'Not Specified' && !locationInfo) {
              locationInfo = answer;
              break;
            }
          }
          
          if (locationInfo) {
            const locationParts = locationInfo.split(',').map(part => part.trim());
            
            if (locationParts.length >= 2) {
              const lastPart = locationParts[locationParts.length - 1];
              const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5})?/);
              
              if (stateZipMatch) {
                if (!job.state) updates.state = stateZipMatch[1];
                if (!job.zipcode && stateZipMatch[2]) updates.zipcode = stateZipMatch[2];
                
                if (!job.city && locationParts.length >= 2) {
                  updates.city = locationParts[locationParts.length - 2];
                }
              }
            }
            
            if (locationParts.length >= 3 && !job.streetAddress) {
              const firstPart = locationParts[0];
              if (/^\d+/.test(firstPart)) {
                updates.streetAddress = firstPart;
              }
            }
          }
          
          if (Object.keys(updates).length > 0) {
            updateEditData(updates);
          }
        } catch (error) {
          console.error('Error parsing job order data:', error);
        }
      }
    };

    handleJobOrderUpdate();
    const interval = setInterval(handleJobOrderUpdate, 3000);
    return () => clearInterval(interval);
  }, [job.id, updateEditData]);

  return null;
};

export default JobDetailsFieldUpdater;

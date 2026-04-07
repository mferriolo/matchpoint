import React, { createContext, useContext, useState, useEffect } from 'react';
import { INITIAL_ACTIVE_JOBS, SPECIAL_JOB_TYPES } from '@/utils/jobTypesData';

interface JobTypesContextType {
  activeJobTypes: string[];
  setActiveJobTypes: (jobTypes: string[]) => void;
  getAllJobTypes: () => string[];
}

const JobTypesContext = createContext<JobTypesContextType | undefined>(undefined);

// Helper function to clean up duplicated job types (e.g., "PhysicianPhysician" -> "Physician")
const cleanJobType = (jobType: string): string => {
  // Check if the job type is duplicated (e.g., "PhysicianPhysician")
  const halfLength = Math.floor(jobType.length / 2);
  const firstHalf = jobType.substring(0, halfLength);
  const secondHalf = jobType.substring(halfLength);
  
  // If both halves are identical, return just one half
  if (firstHalf === secondHalf && firstHalf.length > 0) {
    console.log(`Cleaned duplicated job type: "${jobType}" -> "${firstHalf}"`);
    return firstHalf;
  }
  
  return jobType;
};

export const JobTypesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeJobTypes, setActiveJobTypesState] = useState<string[]>(() => {
    const stored = localStorage.getItem('activeJobTypes');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Clean up any duplicated job types
        const cleaned = parsed.map(cleanJobType);
        console.log('Loaded and cleaned active job types:', cleaned);
        return cleaned;
      } catch (e) {
        console.error('Error parsing activeJobTypes from localStorage:', e);
        return INITIAL_ACTIVE_JOBS;
      }
    }
    return INITIAL_ACTIVE_JOBS;
  });

  const setActiveJobTypes = (jobTypes: string[]) => {
    // Clean job types before saving
    const cleaned = jobTypes.map(cleanJobType);
    setActiveJobTypesState(cleaned);
    localStorage.setItem('activeJobTypes', JSON.stringify(cleaned));
  };

  const getAllJobTypes = () => {
    return [...SPECIAL_JOB_TYPES];
  };

  useEffect(() => {
    localStorage.setItem('activeJobTypes', JSON.stringify(activeJobTypes));
  }, [activeJobTypes]);

  return (
    <JobTypesContext.Provider value={{
      activeJobTypes,
      setActiveJobTypes,
      getAllJobTypes
    }}>
      {children}
    </JobTypesContext.Provider>
  );
};

export const useJobTypes = () => {
  const context = useContext(JobTypesContext);
  if (context === undefined) {
    throw new Error('useJobTypes must be used within a JobTypesProvider');
  }
  return context;
};

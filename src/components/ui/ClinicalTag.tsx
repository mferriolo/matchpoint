import React from 'react';
import { Badge } from '@/components/ui/badge';

export type TagCategory = 'profession' | 'state_license' | 'clinical_specialty' | 'clinical_subspecialty' | 'skill';

interface ClinicalTagProps {
  label: string;
  category: TagCategory;
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
}

// Color scheme for each category
const categoryStyles: Record<TagCategory, string> = {
  profession: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
  state_license: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
  clinical_specialty: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200',
  clinical_subspecialty: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200',
  skill: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
};

// Category labels for tooltips/accessibility
const categoryLabels: Record<TagCategory, string> = {
  profession: 'Profession',
  state_license: 'State License',
  clinical_specialty: 'Clinical Specialty',
  clinical_subspecialty: 'Clinical Subspecialty',
  skill: 'Skill'
};

export const ClinicalTag: React.FC<ClinicalTagProps> = ({
  label,
  category,
  size = 'sm',
  removable = false,
  onRemove
}) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  
  return (
    <Badge
      variant="outline"
      className={`${categoryStyles[category]} ${sizeClasses} border font-medium inline-flex items-center gap-1`}
      title={categoryLabels[category]}
    >
      {label}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-red-600 focus:outline-none"
        >
          ×
        </button>
      )}
    </Badge>
  );
};

// Helper component to render all tags for a candidate
interface CandidateTagsProps {
  jobType?: string;
  stateLicenses?: string[];
  clinicalSpecialty?: string[];
  clinicalSubspecialty?: string[];
  skills?: string[];
  maxDisplay?: number;
  size?: 'sm' | 'md';
}

export const CandidateTags: React.FC<CandidateTagsProps> = ({
  jobType,
  stateLicenses = [],
  clinicalSpecialty = [],
  clinicalSubspecialty = [],
  skills = [],
  maxDisplay = 6,
  size = 'sm'
}) => {
  // Collect all tags with their categories
  const allTags: Array<{ label: string; category: TagCategory }> = [];
  
  // Add profession (job_type) first - highest priority
  if (jobType) {
    allTags.push({ label: jobType, category: 'profession' });
  }
  
  // Add state licenses
  stateLicenses.forEach(license => {
    allTags.push({ label: license, category: 'state_license' });
  });
  
  // Add clinical specialties
  clinicalSpecialty.forEach(specialty => {
    allTags.push({ label: specialty, category: 'clinical_specialty' });
  });
  
  // Add clinical subspecialties
  clinicalSubspecialty.forEach(subspecialty => {
    allTags.push({ label: subspecialty, category: 'clinical_subspecialty' });
  });
  
  // Add general skills last
  skills.forEach(skill => {
    // Skip skills that are already shown as specialty/subspecialty
    if (!clinicalSpecialty.includes(skill) && !clinicalSubspecialty.includes(skill)) {
      allTags.push({ label: skill, category: 'skill' });
    }
  });
  
  const displayTags = allTags.slice(0, maxDisplay);
  const remainingCount = allTags.length - maxDisplay;
  
  if (allTags.length === 0) {
    return null;
  }
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {displayTags.map((tag, index) => (
        <ClinicalTag
          key={`${tag.category}-${tag.label}-${index}`}
          label={tag.label}
          category={tag.category}
          size={size}
        />
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs px-2 py-0.5 bg-gray-50 text-gray-500">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
};

export default ClinicalTag;

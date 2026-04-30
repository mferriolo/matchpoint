// Shared types between the popup, options page, and content scripts.

export interface MpContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  phone_work: string | null;
  phone_cell: string | null;
  phone_home: string | null;
  notes: string | null;
  crelate_contact_id: string | null;
  outreach_status: 'Cold' | 'Replied' | 'Booked' | 'Dead' | null;
}

export interface FieldDiff {
  field: string;
  mp_value: string;
  crelate_value: string;
}

export interface ContactDiff {
  conflicts: FieldDiff[];
  mp_empty: string[];
  crelate_empty: string[];
}

export type DedupeStatus = 'none' | 'linked' | 'match' | 'conflict';

export type FieldChoice = 'mp' | 'crelate' | { override: string };

export interface MpCompany {
  id: string;
  company_name: string | null;
  website: string | null;
  homepage_url: string | null;
  notes: string | null;
  company_phone: string | null;
  contact_phone: string | null;
  location: string | null;
  crelate_id: string | null;
}

export interface CompanyDiff {
  conflicts: FieldDiff[];
  mp_empty: string[];
  crelate_empty: string[];
}

export type EntityType = 'contact' | 'company' | 'job';

// Fields shown in the per-entity panels and used by the conflict picker.
// Keep this in sync with the diff* helpers in extension-bridge/index.ts.
export const ENTITY_FIELDS: Record<EntityType, { key: string; label: string }[]> = {
  contact: [
    { key: 'first_name',   label: 'First name' },
    { key: 'last_name',    label: 'Last name' },
    { key: 'email',        label: 'Email' },
    { key: 'title',        label: 'Title' },
    { key: 'company_name', label: 'Company' },
    { key: 'linkedin_url', label: 'LinkedIn' },
    { key: 'phone_work',   label: 'Phone (work)' },
    { key: 'phone_cell',   label: 'Phone (cell)' },
    { key: 'phone_home',   label: 'Phone (home)' },
    { key: 'notes',        label: 'Notes' },
  ],
  company: [
    { key: 'company_name',  label: 'Name' },
    { key: 'website',       label: 'Website' },
    { key: 'company_phone', label: 'Phone' },
    { key: 'location',      label: 'Location' },
    { key: 'notes',         label: 'Notes' },
  ],
  job: [
    { key: 'job_title',        label: 'Title' },
    { key: 'company_name',     label: 'Company' },
    { key: 'location',         label: 'Location' },
    { key: 'description',      label: 'Description' },
    { key: 'job_url',          label: 'URL' },
    { key: 'website_job_desc', label: 'Job desc URL' },
    { key: 'salary_range',     label: 'Salary' },
  ],
};

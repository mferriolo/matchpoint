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

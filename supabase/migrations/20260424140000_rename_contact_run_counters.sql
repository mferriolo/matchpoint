-- contact_runs table has been serving two modes: find-contacts (iterates
-- companies) and enrich-contacts (iterates contacts). The counter columns
-- were named companies_*, which is accurate for find mode but misleading
-- for enrich mode, where each row is a contact. Rename to generic
-- "items_*" / "current_item" / "per_item" so both modes read cleanly.
--
-- target_company_id / target_company_name are left alone — they are only
-- used by find-contacts (mode='company') and are correctly named.

ALTER TABLE contact_runs RENAME COLUMN companies_total     TO items_total;
ALTER TABLE contact_runs RENAME COLUMN companies_processed TO items_processed;
ALTER TABLE contact_runs RENAME COLUMN current_company     TO current_item;
ALTER TABLE contact_runs RENAME COLUMN per_company         TO per_item;

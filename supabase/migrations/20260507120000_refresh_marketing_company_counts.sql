-- Single-statement recompute of per-company summary fields used by the
-- tracker's "Update Counts" step. Replaces the edge function's 509x
-- per-row UPDATE loop, which was hanging in production when one of the
-- 20-way Promise.all batches got stuck on a slow/locked request.
--
-- Predicate matches updateSummariesBatch in
-- supabase/functions/scrape-healthcare-jobs/index.ts: open jobs are
-- status = 'Open' AND is_closed IS NOT TRUE.

CREATE OR REPLACE FUNCTION public.refresh_marketing_company_counts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated integer;
BEGIN
  WITH job_agg AS (
    SELECT
      company_id,
      COUNT(*)::int AS open_count,
      bool_or(
        lower(COALESCE(job_title, '')) LIKE '%medical director%'
        OR lower(COALESCE(job_title, '')) LIKE '%chief medical%'
      ) AS md_cmo
    FROM marketing_jobs
    WHERE status = 'Open'
      AND COALESCE(is_closed, false) = false
      AND company_id IS NOT NULL
    GROUP BY company_id
  ),
  contact_agg AS (
    SELECT company_id, COUNT(*)::int AS contact_count
    FROM marketing_contacts
    WHERE company_id IS NOT NULL
    GROUP BY company_id
  )
  UPDATE marketing_companies c
     SET open_roles_count = COALESCE(j.open_count, 0),
         has_md_cmo       = COALESCE(j.md_cmo, false),
         contact_count    = COALESCE(k.contact_count, 0),
         updated_at       = now()
    FROM marketing_companies cc
    LEFT JOIN job_agg     j ON j.company_id = cc.id
    LEFT JOIN contact_agg k ON k.company_id = cc.id
   WHERE c.id = cc.id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_marketing_company_counts() TO authenticated, service_role;

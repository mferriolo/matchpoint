-- merge_companies: reassign all marketing_jobs + marketing_contacts
-- rows that reference any company_id in merge_ids over to canonical_id,
-- then delete the merged company rows. All in a single transaction
-- (plpgsql functions run inside the caller's transaction, so a failure
-- at any step rolls back the FK reassignments too).
--
-- Returns a jsonb summary so the client can show "moved N jobs / M
-- contacts / deleted K companies" after the merge.
--
-- Does NOT merge fields into canonical — whichever company row the user
-- picked as canonical keeps its own values. Editing fields after a
-- merge is a manual step.

CREATE OR REPLACE FUNCTION merge_companies(
  canonical_id uuid,
  merge_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical_name text;
  jobs_moved int;
  contacts_moved int;
  companies_deleted int;
BEGIN
  IF array_length(merge_ids, 1) IS NULL OR array_length(merge_ids, 1) < 1 THEN
    RAISE EXCEPTION 'merge_ids must be non-empty';
  END IF;
  IF canonical_id = ANY(merge_ids) THEN
    RAISE EXCEPTION 'canonical_id must not appear in merge_ids';
  END IF;

  SELECT company_name INTO canonical_name
    FROM marketing_companies
    WHERE id = canonical_id;
  IF canonical_name IS NULL THEN
    RAISE EXCEPTION 'canonical company not found: %', canonical_id;
  END IF;

  UPDATE marketing_jobs
     SET company_id = canonical_id,
         company_name = canonical_name
   WHERE company_id = ANY(merge_ids);
  GET DIAGNOSTICS jobs_moved = ROW_COUNT;

  UPDATE marketing_contacts
     SET company_id = canonical_id,
         company_name = canonical_name
   WHERE company_id = ANY(merge_ids);
  GET DIAGNOSTICS contacts_moved = ROW_COUNT;

  DELETE FROM marketing_companies
   WHERE id = ANY(merge_ids);
  GET DIAGNOSTICS companies_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'canonical_id', canonical_id,
    'canonical_name', canonical_name,
    'jobs_moved', jobs_moved,
    'contacts_moved', contacts_moved,
    'companies_deleted', companies_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_companies(uuid, uuid[]) TO authenticated, service_role, anon;

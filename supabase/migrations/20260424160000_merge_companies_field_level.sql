-- Replace merge_companies with a version that also merges field values
-- onto the canonical row before deleting the merged rows.
--
-- Merge rules per field:
--   • Fill-if-empty: company_type, industry, website, careers_url,
--     location, homepage_url, role_types_hired, source
--     (canonical keeps its own value if set; otherwise picks the first
--      non-empty value from any merged row)
--   • OR-merged booleans: is_high_priority, has_md_cmo
--   • Concatenated: notes (canonical first, divider, then each merged
--     row's notes prefixed with its company_name)
--   • MAX-merged: last_searched_at
--   • Recomputed from children: open_roles_count, contact_count
--   • Always left alone on canonical: id, company_name, created_at,
--     is_blocked (user decision), is_recurring_source, status,
--     crelate_id (external FK). updated_at is set to now().
--
-- Returns a jsonb summary with the list of fields that were filled and
-- the counts of FK rows reassigned + companies deleted, so the UI can
-- show "filled website, industry · moved 12 jobs, 3 contacts · deleted
-- 2 companies" after each merge.

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
  fill_cols text[] := ARRAY[
    'company_type', 'industry', 'website', 'careers_url',
    'location', 'homepage_url', 'role_types_hired', 'source'
  ];
  col text;
  fields_filled text[] := ARRAY[]::text[];
  before_val text;
  after_val text;
  is_text_col boolean;
  merged_notes text;
  had_notes boolean;
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

  -- 1. Reassign child rows to canonical.
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

  -- 2. Field-level fill. Loop through the list and, for each col that's
  --    currently NULL/empty on canonical, grab the first non-empty value
  --    from any of the merged rows. Track what changed so the client
  --    can show which fields were filled.
  FOREACH col IN ARRAY fill_cols LOOP
    -- Confirm the column actually exists on the table before touching
    -- it (schema drift safety — if a column is dropped later this RPC
    -- still works).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketing_companies'
         AND column_name = col
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT %I::text FROM marketing_companies WHERE id = $1', col)
      INTO before_val USING canonical_id;

    SELECT data_type IN ('text', 'character varying', 'citext') INTO is_text_col
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketing_companies'
        AND column_name = col;

    IF is_text_col THEN
      EXECUTE format($q$
        UPDATE marketing_companies c
           SET %1$I = (
             SELECT m.%1$I FROM marketing_companies m
              WHERE m.id = ANY($1)
                AND m.%1$I IS NOT NULL AND btrim(m.%1$I) <> ''
              LIMIT 1
           )
         WHERE c.id = $2 AND (c.%1$I IS NULL OR btrim(c.%1$I) = '')
      $q$, col) USING merge_ids, canonical_id;
    ELSE
      EXECUTE format($q$
        UPDATE marketing_companies c
           SET %1$I = (
             SELECT m.%1$I FROM marketing_companies m
              WHERE m.id = ANY($1) AND m.%1$I IS NOT NULL
              LIMIT 1
           )
         WHERE c.id = $2 AND c.%1$I IS NULL
      $q$, col) USING merge_ids, canonical_id;
    END IF;

    EXECUTE format('SELECT %I::text FROM marketing_companies WHERE id = $1', col)
      INTO after_val USING canonical_id;

    IF before_val IS DISTINCT FROM after_val THEN
      fields_filled := fields_filled || col;
    END IF;
  END LOOP;

  -- 3. OR-merged flags. If ANY row (canonical or merged) has the flag
  --    true, canonical ends up true. Only does anything if canonical
  --    is currently false/null.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'is_high_priority') THEN
    UPDATE marketing_companies
       SET is_high_priority = true
     WHERE id = canonical_id
       AND COALESCE(is_high_priority, false) = false
       AND EXISTS (
         SELECT 1 FROM marketing_companies m
          WHERE m.id = ANY(merge_ids) AND m.is_high_priority = true
       );
    IF FOUND THEN fields_filled := fields_filled || 'is_high_priority'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'has_md_cmo') THEN
    UPDATE marketing_companies
       SET has_md_cmo = true
     WHERE id = canonical_id
       AND COALESCE(has_md_cmo, false) = false
       AND EXISTS (
         SELECT 1 FROM marketing_companies m
          WHERE m.id = ANY(merge_ids) AND m.has_md_cmo = true
       );
    IF FOUND THEN fields_filled := fields_filled || 'has_md_cmo'; END IF;
  END IF;

  -- 4. MAX-merge last_searched_at so canonical reflects the most recent
  --    scrape across the merged cohort.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'last_searched_at') THEN
    UPDATE marketing_companies c
       SET last_searched_at = GREATEST(
         c.last_searched_at,
         (SELECT MAX(m.last_searched_at) FROM marketing_companies m WHERE m.id = ANY(merge_ids))
       )
     WHERE c.id = canonical_id
       AND (SELECT MAX(m.last_searched_at) FROM marketing_companies m WHERE m.id = ANY(merge_ids)) IS NOT NULL
       AND (c.last_searched_at IS NULL OR (SELECT MAX(m.last_searched_at) FROM marketing_companies m WHERE m.id = ANY(merge_ids)) > c.last_searched_at);
    IF FOUND THEN fields_filled := fields_filled || 'last_searched_at'; END IF;
  END IF;

  -- 5. Concatenate notes from merged rows into canonical's notes field
  --    (if that column exists). Each merged row's notes are prefixed
  --    with "[merged from <name>]" so it's obvious where they came
  --    from. Canonical's existing notes stay at the top.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'notes') THEN
    SELECT string_agg(
             '[merged from ' || m.company_name || '] ' || m.notes,
             E'\n'
             ORDER BY m.company_name
           )
      INTO merged_notes
      FROM marketing_companies m
      WHERE m.id = ANY(merge_ids)
        AND m.notes IS NOT NULL AND btrim(m.notes) <> '';
    IF merged_notes IS NOT NULL THEN
      SELECT (notes IS NOT NULL AND btrim(notes) <> '') INTO had_notes
        FROM marketing_companies WHERE id = canonical_id;
      UPDATE marketing_companies
         SET notes = CASE
           WHEN had_notes THEN notes || E'\n' || merged_notes
           ELSE merged_notes
         END
       WHERE id = canonical_id;
      fields_filled := fields_filled || 'notes';
    END IF;
  END IF;

  -- 6. Delete merged company rows. The jobs + contacts FKs have already
  --    moved off them, so nothing dangling.
  DELETE FROM marketing_companies
   WHERE id = ANY(merge_ids);
  GET DIAGNOSTICS companies_deleted = ROW_COUNT;

  -- 7. Recompute aggregate counts on canonical so they reflect the
  --    reassigned child rows rather than a stale snapshot. Open-role
  --    definition matches the app's scraper filters (not closed /
  --    status <> 'Closed').
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'open_roles_count') THEN
    UPDATE marketing_companies
       SET open_roles_count = (
         SELECT COUNT(*) FROM marketing_jobs j
          WHERE j.company_id = canonical_id
            AND COALESCE(j.is_closed, false) = false
            AND COALESCE(j.status, '') <> 'Closed'
       )
     WHERE id = canonical_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'contact_count') THEN
    UPDATE marketing_companies
       SET contact_count = (
         SELECT COUNT(*) FROM marketing_contacts ct
          WHERE ct.company_id = canonical_id
       )
     WHERE id = canonical_id;
  END IF;

  -- 8. Stamp updated_at if present.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_companies'
                AND column_name = 'updated_at') THEN
    UPDATE marketing_companies SET updated_at = now() WHERE id = canonical_id;
  END IF;

  RETURN jsonb_build_object(
    'canonical_id', canonical_id,
    'canonical_name', canonical_name,
    'jobs_moved', jobs_moved,
    'contacts_moved', contacts_moved,
    'companies_deleted', companies_deleted,
    'fields_filled', fields_filled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_companies(uuid, uuid[]) TO authenticated, service_role, anon;

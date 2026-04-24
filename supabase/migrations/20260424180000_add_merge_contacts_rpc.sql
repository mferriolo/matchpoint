-- merge_contacts: mirror of merge_companies for marketing_contacts.
-- Fills empty fields on canonical from merged rows (first non-empty
-- wins), OR-merges is_verified, concatenates notes, calls
-- recompute_contact_confidence to refresh confidence_score, then
-- deletes the merged rows. No FK cascades to handle — contact is a
-- leaf entity.
--
-- Field rules:
--   • Fill-if-empty: company_id, company_name, email, title,
--     linkedin_url, source_url, phone_work, phone_home, phone_cell,
--     source, crelate_contact_id, crelate_url
--   • OR-merged: is_verified
--   • Concatenated (prefixed with merged contact's name + company):
--     notes
--   • Recomputed from recompute_contact_confidence(): confidence_score
--   • Never touched on canonical: id, first_name, last_name,
--     created_at, tracker_run_id

CREATE OR REPLACE FUNCTION merge_contacts(
  canonical_id uuid,
  merge_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fill_cols text[] := ARRAY[
    'company_id', 'company_name', 'email', 'title', 'linkedin_url',
    'source_url', 'phone_work', 'phone_home', 'phone_cell', 'source',
    'crelate_contact_id', 'crelate_url'
  ];
  col text;
  fields_filled text[] := ARRAY[]::text[];
  before_val text;
  after_val text;
  is_text_col boolean;
  merged_notes text;
  had_notes boolean;
  contacts_deleted int;
BEGIN
  IF array_length(merge_ids, 1) IS NULL OR array_length(merge_ids, 1) < 1 THEN
    RAISE EXCEPTION 'merge_ids must be non-empty';
  END IF;
  IF canonical_id = ANY(merge_ids) THEN
    RAISE EXCEPTION 'canonical_id must not appear in merge_ids';
  END IF;

  PERFORM 1 FROM marketing_contacts WHERE id = canonical_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical contact not found: %', canonical_id;
  END IF;

  FOREACH col IN ARRAY fill_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketing_contacts'
         AND column_name = col
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT %I::text FROM marketing_contacts WHERE id = $1', col)
      INTO before_val USING canonical_id;

    SELECT data_type IN ('text', 'character varying', 'citext') INTO is_text_col
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketing_contacts'
        AND column_name = col;

    IF is_text_col THEN
      EXECUTE format($q$
        UPDATE marketing_contacts c
           SET %1$I = (
             SELECT m.%1$I FROM marketing_contacts m
              WHERE m.id = ANY($1)
                AND m.%1$I IS NOT NULL AND btrim(m.%1$I) <> ''
              LIMIT 1
           )
         WHERE c.id = $2 AND (c.%1$I IS NULL OR btrim(c.%1$I) = '')
      $q$, col) USING merge_ids, canonical_id;
    ELSE
      EXECUTE format($q$
        UPDATE marketing_contacts c
           SET %1$I = (
             SELECT m.%1$I FROM marketing_contacts m
              WHERE m.id = ANY($1) AND m.%1$I IS NOT NULL
              LIMIT 1
           )
         WHERE c.id = $2 AND c.%1$I IS NULL
      $q$, col) USING merge_ids, canonical_id;
    END IF;

    EXECUTE format('SELECT %I::text FROM marketing_contacts WHERE id = $1', col)
      INTO after_val USING canonical_id;

    IF before_val IS DISTINCT FROM after_val THEN
      fields_filled := array_append(fields_filled, col);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_contacts'
                AND column_name = 'is_verified') THEN
    UPDATE marketing_contacts
       SET is_verified = true
     WHERE id = canonical_id
       AND COALESCE(is_verified, false) = false
       AND EXISTS (
         SELECT 1 FROM marketing_contacts m
          WHERE m.id = ANY(merge_ids) AND m.is_verified = true
       );
    IF FOUND THEN fields_filled := array_append(fields_filled, 'is_verified'); END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_contacts'
                AND column_name = 'notes') THEN
    SELECT string_agg(
             '[merged from ' ||
               COALESCE(NULLIF(btrim(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), '(unnamed)') ||
               CASE WHEN m.company_name IS NOT NULL AND btrim(m.company_name) <> '' THEN ' @ ' || m.company_name ELSE '' END ||
               '] ' || m.notes,
             E'\n'
             ORDER BY m.created_at
           )
      INTO merged_notes
      FROM marketing_contacts m
      WHERE m.id = ANY(merge_ids)
        AND m.notes IS NOT NULL AND btrim(m.notes) <> '';
    IF merged_notes IS NOT NULL THEN
      SELECT (notes IS NOT NULL AND btrim(notes) <> '') INTO had_notes
        FROM marketing_contacts WHERE id = canonical_id;
      UPDATE marketing_contacts
         SET notes = CASE
           WHEN had_notes THEN notes || E'\n' || merged_notes
           ELSE merged_notes
         END
       WHERE id = canonical_id;
      fields_filled := array_append(fields_filled, 'notes');
    END IF;
  END IF;

  DELETE FROM marketing_contacts WHERE id = ANY(merge_ids);
  GET DIAGNOSTICS contacts_deleted = ROW_COUNT;

  -- Best-effort confidence recompute. RPC may be absent on older
  -- schemas; swallowing the exception keeps the merge itself atomic.
  BEGIN
    PERFORM recompute_contact_confidence();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'marketing_contacts'
                AND column_name = 'updated_at') THEN
    UPDATE marketing_contacts SET updated_at = now() WHERE id = canonical_id;
  END IF;

  RETURN jsonb_build_object(
    'canonical_id', canonical_id,
    'contacts_deleted', contacts_deleted,
    'fields_filled', fields_filled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_contacts(uuid, uuid[]) TO authenticated, service_role, anon;

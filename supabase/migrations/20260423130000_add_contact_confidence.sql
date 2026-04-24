-- Contact confidence scoring (0-5).
--
-- Rubric:
--   Duplicate (same first_name+last_name as another row, any company):
--     score = 0
--   Otherwise, score = 1 + sum of:
--     +1 title present
--     +1 company_name present
--     +1 email present
--     +1 phone_cell present
--   Max 5. "Unique with email+cell+title+company" = 5.
--
-- The recompute function is a single UPDATE across the whole table so
-- we can call it after any bulk change without hammering Postgres.

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT NOT NULL DEFAULT 0
    CHECK (confidence_score BETWEEN 0 AND 5);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_confidence
  ON marketing_contacts (confidence_score DESC);

CREATE OR REPLACE FUNCTION recompute_contact_confidence() RETURNS void
LANGUAGE sql AS $$
  UPDATE marketing_contacts mc SET confidence_score = CASE
    WHEN dup.dup_count > 1 THEN 0
    ELSE LEAST(5,
      1
      + CASE WHEN mc.title        IS NOT NULL AND mc.title        <> '' THEN 1 ELSE 0 END
      + CASE WHEN mc.company_name IS NOT NULL AND mc.company_name <> '' THEN 1 ELSE 0 END
      + CASE WHEN mc.email        IS NOT NULL AND mc.email        <> '' THEN 1 ELSE 0 END
      + CASE WHEN mc.phone_cell   IS NOT NULL AND mc.phone_cell   <> '' THEN 1 ELSE 0 END
    )
  END
  FROM (
    SELECT id,
      COUNT(*) OVER (
        PARTITION BY lower(coalesce(first_name,'')), lower(coalesce(last_name,''))
      ) AS dup_count
    FROM marketing_contacts
    WHERE coalesce(first_name,'') <> '' OR coalesce(last_name,'') <> ''
  ) dup
  WHERE mc.id = dup.id;
$$;

-- Seed the column with scores computed from whatever's currently in the table.
SELECT recompute_contact_confidence();

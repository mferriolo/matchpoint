-- Crelate ⇄ MatchPoint bridge schema. Two tables, both used by the new
-- extension-bridge edge function and the chrome extension.
--
--   crelate_links — pairs a MatchPoint row with a Crelate entity by id, so
--     subsequent syncs can detect the same record without re-running the
--     name/email match every time. The existing push-to-crelate flow
--     stores crelate_id on each entity table; this generalises it for
--     bidirectional ops and lets us track sync provenance independently.
--
--   sync_log — audit trail. One row per push/pull/skip/conflict. Powers
--     the History tab in the extension and lets us debug "why didn't
--     contact X sync?" weeks later.
--
-- Both are idempotent — re-running this migration is a no-op.

CREATE TABLE IF NOT EXISTS crelate_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('contact', 'company', 'job')),
  mp_id        uuid NOT NULL,
  crelate_id   text NOT NULL,
  -- last_synced_at is the floor we compare against on subsequent pulls.
  -- Set to now() on every successful push/pull operation.
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  -- Direction of the most recent sync — 'push' (MP → Crelate) or 'pull'
  -- (Crelate → MP). Helps the conflict UI choose a sensible default.
  last_direction  text NOT NULL CHECK (last_direction IN ('push', 'pull')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crelate_links_mp
  ON crelate_links (entity_type, mp_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crelate_links_crelate
  ON crelate_links (entity_type, crelate_id);

CREATE TABLE IF NOT EXISTS sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('contact', 'company', 'job')),
  direction    text NOT NULL CHECK (direction IN ('push', 'pull')),
  -- 'create' = wrote a new entity on the target side
  -- 'update' = patched an existing target entity
  -- 'skip'   = matched an existing pair but no changes detected
  -- 'conflict' = same record on both sides has divergent fields; user must resolve
  -- 'error'  = upstream API or DB call failed; see error_message
  action       text NOT NULL CHECK (action IN ('create', 'update', 'skip', 'conflict', 'error')),
  mp_id        uuid,
  crelate_id   text,
  -- Snapshot of which fields actually changed (or which had conflicts).
  -- jsonb so the History UI can render diffs without re-fetching.
  fields_changed jsonb,
  -- When action='conflict' and the user picks a resolution, store the
  -- chosen direction so we can audit it later. NULL otherwise.
  conflict_resolution text,
  -- Free-form note for errors. Truncated client-side to ~500 chars.
  error_message text,
  -- Who triggered this — 'extension', 'web-bulk', 'web-single', etc.
  -- Lets us split the History tab by origin if needed.
  actor        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created_at
  ON sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_mp_id
  ON sync_log (mp_id) WHERE mp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_log_entity_action
  ON sync_log (entity_type, action, created_at DESC);

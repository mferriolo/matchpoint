-- Stores per-Gmail-account OAuth tokens for the "Send via Gmail"
-- outreach path. Keyed by the connected gmail_email so a future
-- multi-user setup can store one row per recruiter without schema
-- changes; the single-tenant case has exactly one row.
--
-- access_token rotates often (1h Google default). refresh_token
-- effectively never expires unless revoked. We store both; the
-- gmail-send edge function refreshes access_token on demand.

CREATE TABLE IF NOT EXISTS public.gmail_tokens (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_email              text NOT NULL UNIQUE,
  refresh_token            text NOT NULL,
  access_token             text,
  access_token_expires_at  timestamptz,
  scope                    text,
  google_subject           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_tokens_email
  ON public.gmail_tokens (lower(gmail_email));

-- Bump updated_at on any change so the UI can show a "last refreshed"
-- timestamp without us having to remember to set it everywhere.
CREATE OR REPLACE FUNCTION public.gmail_tokens_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gmail_tokens_updated_at ON public.gmail_tokens;
CREATE TRIGGER trg_gmail_tokens_updated_at
  BEFORE UPDATE ON public.gmail_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.gmail_tokens_set_updated_at();

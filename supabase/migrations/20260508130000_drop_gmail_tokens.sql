-- Roll back the Gmail OAuth integration. The original migration's
-- table + trigger function exist in the remote DB; reverting the
-- migration FILE doesn't drop them, so this forward migration cleans
-- up after itself. Safe to apply on a fresh DB too — IF EXISTS guards
-- both objects.

DROP TABLE IF EXISTS public.gmail_tokens CASCADE;
DROP FUNCTION IF EXISTS public.gmail_tokens_set_updated_at();

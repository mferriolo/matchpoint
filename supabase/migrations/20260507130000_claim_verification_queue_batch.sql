-- Atomic batch claim for the Scrub Closed Jobs queue.
--
-- The verify-job-links edge function previously did SELECT ... LIMIT n
-- followed by UPDATE ... WHERE id IN (ids). With one process-next call
-- in flight at a time that's fine, but it can't be parallelized: two
-- concurrent callers will SELECT overlapping pending rows and each
-- launch its own SerpAPI + OpenAI calls, double-charging the user.
--
-- This RPC does the SELECT and UPDATE in one statement with FOR UPDATE
-- SKIP LOCKED so concurrent callers atomically claim disjoint slices
-- of the queue. Caller passes run_id + batch_size and gets back the
-- already-claimed (status='processing') rows ready to process.

CREATE OR REPLACE FUNCTION public.claim_verification_queue_batch(
  p_run_id uuid,
  p_batch_size int
)
RETURNS SETOF public.job_verification_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE job_verification_queue q
     SET status = 'processing',
         started_at = now()
   WHERE q.id IN (
     SELECT id
       FROM job_verification_queue
      WHERE run_id = p_run_id
        AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT GREATEST(p_batch_size, 1)
      FOR UPDATE SKIP LOCKED
   )
   RETURNING q.*;
$$;

GRANT EXECUTE ON FUNCTION public.claim_verification_queue_batch(uuid, int)
  TO authenticated, service_role;

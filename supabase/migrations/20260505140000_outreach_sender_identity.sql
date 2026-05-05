-- Seed the outreach sender identity for the primary user (Matthew
-- Ferriolo, Managing Partner at MedCentric). These keys feed the
-- script generator and the Outreach Workspace so generated emails,
-- call openers, and LinkedIn notes sign off under the user's actual
-- name instead of placeholder text. The Settings tab exposes the same
-- fields so the user can edit at any time.

INSERT INTO system_settings (key, value, description) VALUES
  ('outreach.sender_first_name', to_jsonb('Matthew'::text),         'Sender first name (used in generated outreach messages)'),
  ('outreach.sender_last_name',  to_jsonb('Ferriolo'::text),        'Sender last name (used in generated outreach messages)'),
  ('outreach.sender_title',      to_jsonb('Managing Partner'::text),'Sender job title (used in generated outreach messages)'),
  ('outreach.sender_company',    to_jsonb('MedCentric'::text),      'Sender company name (used in generated outreach messages)')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description;

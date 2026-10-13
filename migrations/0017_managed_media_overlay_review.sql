-- The exact server-rendered labels must travel with the immutable image bytes.
-- Historical renders have no trustworthy label snapshot and must be regenerated
-- before Social Desk distribution. Source photos remain eligible without OCR.
alter table managed_listing_media add column if not exists overlay_text text;

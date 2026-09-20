-- Reserve an approved revision before any external side effect.
alter table social_drafts drop constraint social_drafts_state_check;
alter table social_drafts add constraint social_drafts_state_check
  check(state in ('draft','approved','handed_off','reported_posted','publishing','scheduled','published','failed'));
alter table social_draft_publications drop constraint social_draft_publications_status_check;
alter table social_draft_publications add constraint social_draft_publications_status_check
  check(status in ('scheduled','published','failed','unknown'));

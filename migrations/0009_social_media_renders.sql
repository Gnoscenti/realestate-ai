-- Server-owned, tenant-scoped social media render jobs.
--
-- The app accepts listing and listing_media IDs only. The composite foreign
-- keys below make it impossible for a job to reference another listing's or
-- another workspace's photo, even if application validation regresses.

create table if not exists social_media_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  listing_id text not null,
  kind text not null check (kind in ('image', 'video')),
  template_key text not null,
  provider text not null check (provider in ('orshot', 'video_setup')),
  status text not null check (
    status in (
      'processing', 'completed', 'failed', 'blocked', 'setup_required',
      'attention_required'
    )
  ),
  idempotency_key text not null,
  intent_key text not null,
  unit_count integer not null default 0 check (unit_count in (0, 1)),
  provider_job_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, workspace_id),
  unique (workspace_id, user_id, idempotency_key),
  foreign key (listing_id, workspace_id)
    references listings(id, workspace_id) on delete cascade
);

create index if not exists social_media_jobs_workspace_created_idx
  on social_media_jobs(workspace_id, created_at desc);

-- One active/uncertain render per exact user intent. A completed or definitively
-- failed render can be replaced only after the client explicitly starts a new
-- request. attention_required stays locked until an operator reconciles it.
create unique index if not exists social_media_jobs_active_image_intent_idx
  on social_media_jobs(workspace_id, user_id, intent_key)
  where kind = 'image'
    and status in ('processing', 'attention_required');

-- Support a database-enforced media -> listing -> workspace chain.
create unique index if not exists listing_media_tenant_listing_unique
  on listing_media(id, workspace_id, listing_id);

create table if not exists social_media_job_media (
  job_id text not null,
  workspace_id text not null,
  listing_id text not null,
  media_id text not null,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (job_id, media_id),
  unique (job_id, sort_order),
  foreign key (job_id, workspace_id)
    references social_media_jobs(id, workspace_id) on delete cascade,
  foreign key (media_id, workspace_id, listing_id)
    references listing_media(id, workspace_id, listing_id)
    on delete no action deferrable initially deferred
);

create table if not exists social_media_assets (
  id text primary key,
  job_id text not null,
  workspace_id text not null,
  kind text not null check (kind in ('image', 'video')),
  provider text not null,
  content_url text not null,
  content_type text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, kind),
  foreign key (job_id, workspace_id)
    references social_media_jobs(id, workspace_id) on delete cascade
);

create index if not exists social_media_assets_workspace_idx
  on social_media_assets(workspace_id, created_at desc);

-- One atomic counter per verified billing period. Failed provider attempts are
-- intentionally charged against this conservative hard cap because a network
-- timeout can occur after the provider has already consumed a render credit.
create table if not exists social_media_quota_buckets (
  workspace_id text not null references workspaces(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  used_units integer not null default 0 check (used_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, period_start),
  check (period_end > period_start)
);

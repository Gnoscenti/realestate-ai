-- Atomic, fail-closed guards for paid Grok calls plus durable social-render jobs.
-- Quotas are per authenticated user within a workspace. A reservation function
-- serializes each user/product bucket so concurrent requests cannot overrun it.

create table if not exists ai_generation_quota_buckets (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  product text not null check (product in ('grok_assistant', 'grok_media')),
  minute_bucket_start timestamptz not null,
  minute_request_count integer not null default 0
    check (minute_request_count >= 0),
  day_bucket_start timestamptz not null,
  day_units integer not null default 0 check (day_units >= 0),
  period_bucket_start timestamptz not null,
  period_units integer not null default 0 check (period_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, product)
);

-- The entitlement limit belongs to the workspace, not to every member. This
-- shared bucket prevents a team from multiplying its subscription allowance by
-- adding users, while the table above still enforces per-user rate limits.
create table if not exists ai_generation_workspace_quota_buckets (
  workspace_id text not null references workspaces(id) on delete cascade,
  product text not null check (product in ('grok_assistant', 'grok_media')),
  period_bucket_start timestamptz not null,
  period_units integer not null default 0 check (period_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, product)
);

create table if not exists ai_generations (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  product text not null check (product in ('grok_assistant', 'grok_media')),
  operation text not null check (operation in ('assistant', 'image', 'video')),
  model text not null,
  input_chars integer not null check (input_chars >= 0),
  units integer not null check (units > 0),
  idempotency_key text not null check (
    char_length(idempotency_key) between 1 and 240
  ),
  request_fingerprint text not null check (
    char_length(request_fingerprint) = 64
  ),
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, user_id, product, idempotency_key)
);

create index if not exists ai_generations_user_usage_idx
  on ai_generations(workspace_id, user_id, product, created_at desc);

-- Locking one bucket row per user/product makes the entitlement check, quota
-- rollover, quota consumption, and reservation insertion one database-atomic
-- operation on both Postgres/Neon and PGLite.
create or replace function reserve_ai_generation_guard(
  p_generation_id text,
  p_user_id text,
  p_workspace_id text,
  p_product text,
  p_operation text,
  p_model text,
  p_input_chars integer,
  p_units integer,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_minute_request_limit integer,
  p_day_unit_limit integer
)
returns table (
  allowed boolean,
  generation_id text,
  replayed boolean,
  reason text
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_minute_start timestamptz := date_trunc('minute', v_now);
  v_day_start timestamptz :=
    date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_entitlement record;
  v_bucket ai_generation_quota_buckets%rowtype;
  v_workspace_bucket ai_generation_workspace_quota_buckets%rowtype;
  v_existing_id text;
  v_existing_fingerprint text;
  v_period_limit integer;
  v_minute_count integer;
  v_day_units integer;
  v_period_units integer;
  v_workspace_period_units integer;
begin
  -- A completed/retriable request keeps its identity even if the entitlement
  -- later expires. The caller must use the same product + idempotency key.
  select g.id, g.request_fingerprint
    into v_existing_id, v_existing_fingerprint
    from ai_generations g
   where g.workspace_id = p_workspace_id
     and g.user_id = p_user_id
     and g.product = p_product
     and g.idempotency_key = p_idempotency_key
   limit 1;
  if found then
    if v_existing_fingerprint <> p_request_fingerprint then
      raise exception 'Idempotency key reused with different AI request'
        using errcode = '22023';
    end if;
    return query select true, v_existing_id, true, null::text;
    return;
  end if;

  select e.included_units,
         e.hard_limit_units,
         e.overage_authorized,
         e.current_period_start,
         e.current_period_end
    into v_entitlement
    from workspace_entitlements e
    join workspace_memberships m
      on m.workspace_id = e.workspace_id
     and m.user_id = p_user_id
   where e.workspace_id = p_workspace_id
     and e.product = p_product
     and e.status in ('trialing', 'active')
     and e.current_period_start is not null
     and e.current_period_start <= v_now
     and e.current_period_end is not null
     and e.current_period_end > v_now
   for update of e;

  if not found then
    return query
      select false, null::text, false, 'entitlement_required'::text;
    return;
  end if;

  -- No entitlement configuration may create an unbounded provider allowance.
  -- Overage can expand usage only up to an explicit hard limit; otherwise the
  -- included units remain the cap.
  v_period_limit := case
    when v_entitlement.overage_authorized
      then coalesce(v_entitlement.hard_limit_units,
                    v_entitlement.included_units)
    else least(
      v_entitlement.included_units,
      coalesce(v_entitlement.hard_limit_units,
               v_entitlement.included_units)
    )
  end;

  if v_period_limit <= 0 then
    return query select false, null::text, false, 'quota_exceeded'::text;
    return;
  end if;

  -- All users in a workspace serialize through the entitlement-period bucket
  -- before taking their own per-user bucket lock.
  insert into ai_generation_workspace_quota_buckets (
    workspace_id, product, period_bucket_start, period_units
  ) values (
    p_workspace_id, p_product, v_entitlement.current_period_start, 0
  )
  on conflict (workspace_id, product) do nothing;

  select b.*
    into v_workspace_bucket
    from ai_generation_workspace_quota_buckets b
   where b.workspace_id = p_workspace_id
     and b.product = p_product
   for update;

  insert into ai_generation_quota_buckets (
    workspace_id, user_id, product,
    minute_bucket_start, minute_request_count,
    day_bucket_start, day_units,
    period_bucket_start, period_units
  ) values (
    p_workspace_id, p_user_id, p_product,
    v_minute_start, 0,
    v_day_start, 0,
    v_entitlement.current_period_start, 0
  )
  on conflict (workspace_id, user_id, product) do nothing;

  select b.*
    into v_bucket
    from ai_generation_quota_buckets b
   where b.workspace_id = p_workspace_id
     and b.user_id = p_user_id
     and b.product = p_product
   for update;

  -- A concurrent request with the same key may have completed while this call
  -- waited for the bucket lock. Recheck under the lock to avoid double charge.
  select g.id, g.request_fingerprint
    into v_existing_id, v_existing_fingerprint
    from ai_generations g
   where g.workspace_id = p_workspace_id
     and g.user_id = p_user_id
     and g.product = p_product
     and g.idempotency_key = p_idempotency_key
   limit 1;
  if found then
    if v_existing_fingerprint <> p_request_fingerprint then
      raise exception 'Idempotency key reused with different AI request'
        using errcode = '22023';
    end if;
    return query select true, v_existing_id, true, null::text;
    return;
  end if;

  v_minute_count := case
    when v_bucket.minute_bucket_start = v_minute_start
      then v_bucket.minute_request_count + 1
    else 1
  end;
  v_day_units := case
    when v_bucket.day_bucket_start = v_day_start
      then v_bucket.day_units + p_units
    else p_units
  end;
  v_period_units := case
    when v_bucket.period_bucket_start = v_entitlement.current_period_start
      then v_bucket.period_units + p_units
    else p_units
  end;
  v_workspace_period_units := case
    when v_workspace_bucket.period_bucket_start =
         v_entitlement.current_period_start
      then v_workspace_bucket.period_units + p_units
    else p_units
  end;

  if p_units <= 0
     or p_minute_request_limit <= 0
     or p_day_unit_limit <= 0
     or v_minute_count > p_minute_request_limit
     or v_day_units > p_day_unit_limit
     or v_period_units > v_period_limit
     or v_workspace_period_units > v_period_limit then
    return query select false, null::text, false, 'quota_exceeded'::text;
    return;
  end if;

  update ai_generation_quota_buckets
     set minute_bucket_start = v_minute_start,
         minute_request_count = v_minute_count,
         day_bucket_start = v_day_start,
         day_units = v_day_units,
         period_bucket_start = v_entitlement.current_period_start,
         period_units = v_period_units,
         updated_at = v_now
   where workspace_id = p_workspace_id
     and user_id = p_user_id
     and product = p_product;

  update ai_generation_workspace_quota_buckets
     set period_bucket_start = v_entitlement.current_period_start,
         period_units = v_workspace_period_units,
         updated_at = v_now
   where workspace_id = p_workspace_id
     and product = p_product;

  insert into ai_generations (
    id, workspace_id, user_id, product, operation, model,
    input_chars, units, idempotency_key, request_fingerprint, status
  ) values (
    p_generation_id, p_workspace_id, p_user_id, p_product, p_operation,
    p_model, p_input_chars, p_units, p_idempotency_key,
    p_request_fingerprint, 'reserved'
  );

  return query select true, p_generation_id, false, null::text;
end;
$$;

-- Enforce that a render job's selected media belongs to its selected listing.
create unique index if not exists listing_media_id_listing_workspace_idx
  on listing_media(id, listing_id, workspace_id);

create table if not exists social_render_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  listing_id text not null,
  media_id text not null,
  kind text not null check (kind in ('image', 'video')),
  provider text not null check (provider in ('mock', 'xai')),
  status text not null default 'reserved'
    check (status in ('reserved', 'submitted', 'completed', 'failed')),
  idempotency_key text not null check (
    char_length(idempotency_key) between 1 and 240
  ),
  request_fingerprint text not null check (
    char_length(request_fingerprint) = 64
  ),
  provider_request_id text,
  output_url text,
  preview_kind text check (
    preview_kind is null or preview_kind in ('image', 'video')
  ),
  usage_id text references ai_generations(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, user_id, idempotency_key),
  foreign key (media_id, listing_id, workspace_id)
    references listing_media(id, listing_id, workspace_id) on delete cascade
);

create index if not exists social_render_jobs_workspace_idx
  on social_render_jobs(workspace_id, created_at desc);
create index if not exists social_render_jobs_provider_request_idx
  on social_render_jobs(provider, provider_request_id)
  where provider_request_id is not null;

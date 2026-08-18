import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { VOICE_BETA_ALLOWANCE_SECONDS } from "./policy.server";
import { withVoiceWorkspaceMutationLease } from "./workspace-mutation-lease.server";

export const VOICE_BILLING_PRODUCT = "voice_assistant" as const;
export const VOICE_MONTHLY_PRICE_CENTS = 7_900 as const;
export const VOICE_INCLUDED_MINUTES = 200 as const;
const VOICE_CURRENCY = "usd";

type Metadata = Record<string, string | undefined>;

export interface StripePriceLike {
  id: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  type: string;
  unit_amount: number | null;
  billing_scheme?: string;
  recurring: {
    interval: string;
    interval_count: number;
    usage_type?: string;
  } | null;
}

interface StripeCheckoutSessionLike {
  id: string;
  url: string | null;
}

interface StripePortalSessionLike {
  url: string;
}

interface StripeSubscriptionItemLike {
  quantity?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  price: string | { id?: string };
}

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer: string | { id?: string } | null;
  metadata?: Metadata | null;
  current_period_start?: number;
  current_period_end?: number;
  items?: { data?: StripeSubscriptionItemLike[] } | null;
}

export interface StripeInvoiceLike {
  id: string;
  paid?: boolean;
  status?: string | null;
  period_start?: number;
  period_end?: number;
  parent?: {
    type?: string;
    subscription_details?: {
      subscription?: string | { id?: string } | null;
    } | null;
  } | null;
  // Backward compatibility for webhook endpoints pinned before 2025-03-31.
  subscription?: string | { id?: string } | null;
}

export interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  api_version?: string | null;
  data: { object: Record<string, unknown> };
}

export interface StripeClientLike {
  prices: { retrieve(id: string): Promise<StripePriceLike> };
  checkout: {
    sessions: {
      create(
        params: Record<string, unknown>,
        options?: { idempotencyKey?: string },
      ): Promise<StripeCheckoutSessionLike>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: {
        customer: string;
        return_url: string;
      }): Promise<StripePortalSessionLike>;
    };
  };
  subscriptions: {
    retrieve(id: string): Promise<StripeSubscriptionLike>;
  };
  invoices: {
    retrieve(id: string): Promise<StripeInvoiceLike>;
  };
  webhooks: {
    constructEvent(
      rawBody: string | Buffer,
      signature: string,
      secret: string,
    ): StripeEventLike;
  };
}

export interface VoiceStripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  expectedLivemode: boolean;
}

function envValue(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

export function getVoiceStripeConfig(): VoiceStripeConfig | null {
  const secretKey = envValue("STRIPE_SECRET_KEY");
  const webhookSecret = envValue("STRIPE_WEBHOOK_SECRET");
  const priceId = envValue("STRIPE_VOICE_PRICE_ID");
  if (!secretKey || !webhookSecret || !priceId) return null;
  const expectedLivemode = /^(?:sk|rk)_live_/.test(secretKey)
    ? true
    : /^(?:sk|rk)_test_/.test(secretKey)
      ? false
      : null;
  if (expectedLivemode === null) return null;
  return { secretKey, webhookSecret, priceId, expectedLivemode };
}

export async function createVoiceStripeClient(
  secretKey = getVoiceStripeConfig()?.secretKey,
): Promise<StripeClientLike> {
  if (!secretKey) throw new Error("Voice billing is not configured");
  const Stripe = (await import("stripe")).default;
  return new Stripe(secretKey) as unknown as StripeClientLike;
}

export function assertVoicePrice(
  price: StripePriceLike,
  configuredPriceId: string,
  expectedLivemode: boolean,
  requireActive = true,
): void {
  if (
    price.id !== configuredPriceId ||
    (requireActive && !price.active) ||
    price.livemode !== expectedLivemode ||
    price.currency.toLowerCase() !== VOICE_CURRENCY ||
    price.type !== "recurring" ||
    price.unit_amount !== VOICE_MONTHLY_PRICE_CENTS ||
    price.billing_scheme !== "per_unit" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    (price.recurring.usage_type && price.recurring.usage_type !== "licensed")
  ) {
    throw new Error(
      "Voice billing is unavailable because the configured Stripe price is not the expected $79 USD monthly plan.",
    );
  }
}

interface BillingBindingRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  billing_verified_at: string | Date | null;
  billing_event_id: string | null;
}

async function getBillingBinding(
  workspaceId: string,
  sql: Sql,
): Promise<BillingBindingRow | null> {
  const rows = await sql.query<BillingBindingRow>(
    `select stripe_customer_id, stripe_subscription_id, status,
            billing_verified_at, billing_event_id
       from workspace_entitlements
      where workspace_id = $1 and product = 'voice_assistant'
      limit 1`,
    [workspaceId],
  );
  return rows[0] ?? null;
}

export async function getVoiceBillingAvailability(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<{
  monthlyPriceCents: 7900;
  includedMinutes: 200;
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  message: string;
}> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const binding = await getBillingBinding(workspace.id, sql);
  const configured = Boolean(getVoiceStripeConfig());
  const portalAvailable = Boolean(
    configured &&
      binding?.stripe_customer_id &&
      binding.billing_verified_at,
  );
  const existingSubscription = Boolean(
    binding?.stripe_subscription_id &&
      binding.status &&
      !["inactive", "canceled"].includes(binding.status),
  );
  const checkoutAvailable = configured && !existingSubscription;

  let message =
    "$79 per month includes 200 completed inbound AI minutes. New calls pause after completed-call usage reaches 200 minutes; calls already in progress may finish. No overage is charged.";
  if (!configured) {
    message =
      "Checkout is not configured. An administrator must add the Stripe voice price and verified webhook secrets.";
  } else if (existingSubscription) {
    message =
      "Use Stripe billing management to update payment details or cancel. Access changes only after a verified Stripe webhook.";
  }
  return {
    monthlyPriceCents: VOICE_MONTHLY_PRICE_CENTS,
    includedMinutes: VOICE_INCLUDED_MINUTES,
    checkoutAvailable,
    portalAvailable,
    message,
  };
}

export async function createVoiceCheckoutForBinding(
  input: {
    workspaceId: string;
    userId: string;
    customerId: string | null;
    checkoutGeneration: string;
    successUrl: string;
    cancelUrl: string;
  },
  config: VoiceStripeConfig,
  stripe: StripeClientLike,
): Promise<{ url: string; sessionId: string }> {
  const price = await stripe.prices.retrieve(config.priceId);
  assertVoicePrice(price, config.priceId, config.expectedLivemode);

  const metadata = {
    product: VOICE_BILLING_PRODUCT,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    included_seconds: String(VOICE_BETA_ALLOWANCE_SECONDS),
    overage_authorized: "false",
  };
  const params: Record<string, unknown> = {
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId.slice(0, 200),
    billing_address_collection: "auto",
    line_items: [{ price: config.priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
  };
  if (input.customerId) params.customer = input.customerId;

  const idempotencyKey = createHash("sha256")
    .update(
      `voice-checkout-v1\0${input.workspaceId}\0${VOICE_BILLING_PRODUCT}\0${config.priceId}\0${input.checkoutGeneration}`,
    )
    .digest("hex");
  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey,
  });
  if (!session.url || !session.id) {
    throw new Error("Stripe did not return a Voice Assistant checkout URL");
  }
  return { url: session.url, sessionId: session.id };
}

export async function createVoiceCheckoutSession(
  input: {
    workspaceId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  },
  deps: {
    sql?: Sql;
    config?: VoiceStripeConfig;
    stripe?: StripeClientLike;
  } = {},
): Promise<{ url: string; sessionId: string }> {
  const sql = deps.sql ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    input.userId,
    input.workspaceId,
    ["owner", "admin"],
    sql,
  );
  const config = deps.config ?? getVoiceStripeConfig();
  if (!config) {
    throw new Error(
      "Voice checkout is unavailable until Stripe price and webhook settings are configured.",
    );
  }
  const binding = await getBillingBinding(workspace.id, sql);
  if (
    binding?.stripe_subscription_id &&
    binding.status &&
    !["inactive", "canceled"].includes(binding.status)
  ) {
    throw new Error(
      "This workspace already has a Voice Assistant subscription. Use Manage billing instead.",
    );
  }
  const stripe = deps.stripe ?? (await createVoiceStripeClient(config.secretKey));
  return createVoiceCheckoutForBinding(
    {
      ...input,
      workspaceId: workspace.id,
      customerId: binding?.stripe_customer_id ?? null,
      checkoutGeneration:
        binding?.billing_event_id ??
        binding?.stripe_subscription_id ??
        "initial",
    },
    config,
    stripe,
  );
}

export async function createVoicePortalSession(
  input: { workspaceId: string; userId: string; returnUrl: string },
  deps: {
    sql?: Sql;
    config?: VoiceStripeConfig;
    stripe?: StripeClientLike;
  } = {},
): Promise<{ url: string }> {
  const sql = deps.sql ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    input.userId,
    input.workspaceId,
    ["owner", "admin"],
    sql,
  );
  const config = deps.config ?? getVoiceStripeConfig();
  if (!config) throw new Error("Voice billing is not configured");
  const binding = await getBillingBinding(workspace.id, sql);
  if (!binding?.stripe_customer_id || !binding.billing_verified_at) {
    throw new Error("No verified Voice Assistant billing account was found");
  }
  const stripe = deps.stripe ?? (await createVoiceStripeClient(config.secretKey));
  const session = await stripe.billingPortal.sessions.create({
    customer: binding.stripe_customer_id,
    return_url: input.returnUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a billing portal URL");
  return { url: session.url };
}

const SUPPORTED_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

const eventRank: Record<string, number> = {
  "customer.subscription.created": 1,
  "invoice.payment_failed": 2,
  "customer.subscription.updated": 3,
  "invoice.paid": 4,
  "customer.subscription.deleted": 5,
};

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id;
  }
  return null;
}

function subscriptionIdFromInvoice(invoice: StripeInvoiceLike): string | null {
  if (invoice.parent?.type === "subscription_details") {
    const current = objectId(invoice.parent.subscription_details?.subscription);
    if (current) return current;
  }
  return objectId(invoice.subscription);
}

function mapSubscriptionStatus(status: string):
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "paused") return "paused";
  if (status === "canceled") return "canceled";
  return "inactive";
}

function unixIso(value: number | undefined): string | null {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return null;
  return new Date((value as number) * 1000).toISOString();
}

export interface ResolvedVoiceBillingEvent {
  eventId: string;
  eventType: string;
  eventCreated: number;
  eventOrder: number;
  livemode: boolean;
  apiVersion: string | null;
  objectId: string | null;
  workspaceId: string;
  userId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: "inactive" | "trialing" | "active" | "past_due" | "paused" | "canceled";
  periodStart: string | null;
  periodEnd: string | null;
  payloadSha256: string;
}

export type VoiceBillingResolution =
  | { kind: "apply"; update: ResolvedVoiceBillingEvent }
  | {
      kind: "ignore";
      eventId: string;
      eventType: string;
      eventCreated: number;
      eventOrder: number;
      livemode: boolean;
      apiVersion: string | null;
      objectId: string | null;
      payloadSha256: string;
      outcomeCode: string;
      workspaceId?: string;
      customerId?: string;
      subscriptionId?: string;
    };

function ignored(
  event: StripeEventLike,
  payloadSha256: string,
  outcomeCode: string,
  extra: Partial<{
    workspaceId: string;
    customerId: string;
    subscriptionId: string;
  }> = {},
): VoiceBillingResolution {
  return {
    kind: "ignore",
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    eventOrder: Math.max(0, event.created * 10 + (eventRank[event.type] ?? 0)),
    livemode: event.livemode,
    apiVersion: event.api_version ?? null,
    objectId: objectId(event.data?.object),
    payloadSha256,
    outcomeCode,
    ...extra,
  };
}

function validEventEnvelope(event: StripeEventLike): boolean {
  return Boolean(
    event &&
      /^evt_[A-Za-z0-9_]+$/.test(event.id) &&
      event.id.length <= 255 &&
      typeof event.type === "string" &&
      event.type.length <= 120 &&
      Number.isInteger(event.created) &&
      event.created >= 0 &&
      typeof event.livemode === "boolean" &&
      event.data &&
      event.data.object &&
      typeof event.data.object === "object",
  );
}

export async function resolveVoiceBillingEvent(
  event: StripeEventLike,
  payloadSha256: string,
  config: VoiceStripeConfig,
  stripe: StripeClientLike,
): Promise<VoiceBillingResolution> {
  if (!validEventEnvelope(event) || !/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new Error("Invalid verified Stripe event envelope");
  }
  if (!SUPPORTED_EVENTS.has(event.type)) {
    return ignored(event, payloadSha256, "UNSUPPORTED_EVENT");
  }
  if (event.livemode !== config.expectedLivemode) {
    return ignored(event, payloadSha256, "LIVEMODE_MISMATCH");
  }
  const configuredPrice = await stripe.prices.retrieve(config.priceId);
  assertVoicePrice(
    configuredPrice,
    config.priceId,
    config.expectedLivemode,
    false,
  );

  let subscription: StripeSubscriptionLike;
  let invoice: StripeInvoiceLike | null = null;
  if (event.type.startsWith("invoice.")) {
    const invoiceId = objectId(event.data.object);
    if (!invoiceId) return ignored(event, payloadSha256, "INVALID_INVOICE");
    invoice = await stripe.invoices.retrieve(invoiceId);
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    if (!subscriptionId) {
      return ignored(event, payloadSha256, "INVOICE_WITHOUT_SUBSCRIPTION");
    }
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } else {
    const subscriptionId = objectId(event.data.object);
    if (!subscriptionId) {
      return ignored(event, payloadSha256, "INVALID_SUBSCRIPTION");
    }
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const customerId = objectId(subscription.customer);
  const metadata = subscription.metadata ?? {};
  const workspaceId = metadata.workspace_id ?? "";
  const userId = metadata.user_id ?? "";
  const product = metadata.product ?? "";
  const items = subscription.items?.data ?? [];
  const matchingItems = items.filter(
    (item) => objectId(item.price) === config.priceId,
  );
  const subscriptionId = objectId(subscription);
  if (
    !subscriptionId ||
    !customerId ||
    !workspaceId ||
    workspaceId.length > 240 ||
    workspaceId !== workspaceId.trim() ||
    /[\u0000-\u001f]/.test(workspaceId) ||
    !userId ||
    userId.length > 240 ||
    userId !== userId.trim() ||
    /[\u0000-\u001f]/.test(userId) ||
    product !== VOICE_BILLING_PRODUCT
  ) {
    return ignored(event, payloadSha256, "METADATA_MISMATCH", {
      workspaceId: workspaceId || undefined,
      customerId: customerId || undefined,
      subscriptionId: subscriptionId || undefined,
    });
  }
  if (
    items.length !== 1 ||
    matchingItems.length !== 1 ||
    (matchingItems[0]?.quantity ?? 1) !== 1
  ) {
    return ignored(event, payloadSha256, "PRICE_MISMATCH", {
      workspaceId,
      customerId,
      subscriptionId,
    });
  }

  const item = matchingItems[0]!;
  const periodStart = unixIso(
    item.current_period_start ?? subscription.current_period_start,
  );
  const periodEnd = unixIso(
    item.current_period_end ?? subscription.current_period_end,
  );
  let status = mapSubscriptionStatus(subscription.status);
  if (event.type === "customer.subscription.deleted") status = "canceled";
  if (event.type === "invoice.payment_failed") {
    const invoicePeriodEnd = invoice?.period_end;
    const currentPeriodStart =
      item.current_period_start ?? subscription.current_period_start;
    const failedOlderPeriod =
      Number.isInteger(invoicePeriodEnd) &&
      Number.isInteger(currentPeriodStart) &&
      (invoicePeriodEnd as number) <= (currentPeriodStart as number);
    if (!failedOlderPeriod) {
      status = ["canceled", "paused", "inactive"].includes(status)
        ? status
        : "past_due";
    }
  }
  if (event.type === "invoice.paid") {
    const invoicePaid = invoice?.paid === true || invoice?.status === "paid";
    if (!invoicePaid || !["active", "trialing"].includes(status)) {
      status = status === "canceled" ? "canceled" : "inactive";
    }
  }

  return {
    kind: "apply",
    update: {
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      eventOrder: event.created * 10 + (eventRank[event.type] ?? 0),
      livemode: event.livemode,
      apiVersion: event.api_version ?? null,
      objectId: objectId(event.data.object),
      workspaceId,
      userId,
      customerId,
      subscriptionId,
      priceId: config.priceId,
      status,
      periodStart,
      periodEnd,
      payloadSha256,
    },
  };
}

async function recordIgnoredEvent(
  resolution: Extract<VoiceBillingResolution, { kind: "ignore" }>,
  sql: Sql,
): Promise<"ignored" | "duplicate"> {
  const rows = await sql.query<{ event_id: string }>(
    `insert into voice_stripe_events (
       event_id, event_type, event_created, event_order, livemode,
       api_version, object_id, workspace_id, stripe_customer_id,
       stripe_subscription_id, payload_sha256, processing_state, outcome_code
     ) values ($1,$2,$3,$4,$5,$6,$7,
       case when exists (select 1 from workspaces where id = $8) then $8 else null end,
       $9,$10,$11,'ignored',$12)
     on conflict (event_id) do nothing
     returning event_id`,
    [
      resolution.eventId,
      resolution.eventType,
      resolution.eventCreated,
      resolution.eventOrder,
      resolution.livemode,
      resolution.apiVersion,
      resolution.objectId,
      resolution.workspaceId ?? null,
      resolution.customerId ?? null,
      resolution.subscriptionId ?? null,
      resolution.payloadSha256,
      resolution.outcomeCode,
    ],
  );
  return rows[0] ? "ignored" : "duplicate";
}

async function applyResolvedVoiceBillingEventUnlocked(
  resolution: VoiceBillingResolution,
  sql: Sql,
): Promise<{ state: "processed" | "ignored" | "duplicate"; outcomeCode: string }> {
  if (resolution.kind === "ignore") {
    const state = await recordIgnoredEvent(resolution, sql);
    return { state, outcomeCode: resolution.outcomeCode };
  }
  const update = resolution.update;

  const membership = await sql.query<{ ok: boolean }>(
    `select true as ok
       from workspace_memberships
      where workspace_id = $1 and user_id = $2
        and role in ('owner', 'admin')
      limit 1`,
    [update.workspaceId, update.userId],
  );
  if (!membership[0]?.ok) {
    const state = await recordIgnoredEvent(
      {
        kind: "ignore",
        eventId: update.eventId,
        eventType: update.eventType,
        eventCreated: update.eventCreated,
        eventOrder: update.eventOrder,
        livemode: update.livemode,
        apiVersion: update.apiVersion,
        objectId: update.objectId,
        payloadSha256: update.payloadSha256,
        outcomeCode: "WORKSPACE_SCOPE_MISMATCH",
        workspaceId: update.workspaceId,
        customerId: update.customerId,
        subscriptionId: update.subscriptionId,
      },
      sql,
    );
    return { state, outcomeCode: "WORKSPACE_SCOPE_MISMATCH" };
  }

  // The audit insert intentionally comes after the entitlement CTE. PostgreSQL
  // data-modifying CTEs share one snapshot, so a sibling UPDATE cannot see a
  // row inserted earlier in the same WITH. Computing the final audit state from
  // entitlement RETURNING keeps the first delivery atomic while the event key
  // still turns every replay into a no-op/duplicate.
  const rows = await sql.query<{
    processing_state: "processed" | "ignored";
    outcome_code: string;
  }>(
    `with allowed as (
       select 1
         from workspace_memberships
        where workspace_id = $8 and user_id = $9
          and role in ('owner', 'admin')
        limit 1
     ), entitlement as (
       insert into workspace_entitlements (
         workspace_id, product, status, stripe_customer_id,
         stripe_subscription_id, stripe_price_id, included_units,
         hard_limit_units, overage_authorized, current_period_start,
         current_period_end, billing_verified_at, billing_event_id,
         billing_event_order, updated_at
       )
       select $8,'voice_assistant',$13,$10,$11,$14,$15,$15,false,
              $16::timestamptz,$17::timestamptz,now(),$1,$4,now()
         from allowed
        where not exists (
          select 1 from voice_stripe_events where event_id = $1
        )
       on conflict (workspace_id, product) do update set
         status = excluded.status,
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         stripe_price_id = excluded.stripe_price_id,
         included_units = excluded.included_units,
         hard_limit_units = excluded.hard_limit_units,
         overage_authorized = false,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         billing_verified_at = excluded.billing_verified_at,
         billing_event_id = case
           when excluded.billing_event_order >= coalesce(workspace_entitlements.billing_event_order, -1)
             then excluded.billing_event_id
           else workspace_entitlements.billing_event_id
         end,
         billing_event_order = greatest(
           excluded.billing_event_order,
           coalesce(workspace_entitlements.billing_event_order, -1)
         ),
         updated_at = now()
       where (
         workspace_entitlements.stripe_customer_id is null
         or workspace_entitlements.stripe_customer_id = excluded.stripe_customer_id
       ) and (
         workspace_entitlements.stripe_subscription_id is null
         or workspace_entitlements.stripe_subscription_id = excluded.stripe_subscription_id
         or (
           workspace_entitlements.status in ('inactive', 'canceled')
           and excluded.billing_event_order > coalesce(workspace_entitlements.billing_event_order, -1)
         )
       ) and excluded.billing_event_order >= coalesce(workspace_entitlements.billing_event_order, -1)
       returning workspace_id
     ), inserted_event as (
       insert into voice_stripe_events (
         event_id, event_type, event_created, event_order, livemode,
         api_version, object_id, workspace_id, stripe_customer_id,
         stripe_subscription_id, payload_sha256, processing_state, outcome_code
       )
       select $1,$2,$3,$4,$5,$6,$7,$8,$10,$11,$12,
              case
                when exists (select 1 from entitlement) then 'processed'
                else 'ignored'
              end,
              case
                when exists (select 1 from entitlement) then 'ENTITLEMENT_SYNCED'
                when exists (
                  select 1
                    from workspace_entitlements
                   where workspace_id = $8 and product = 'voice_assistant'
                     and billing_event_order > $4
                ) then 'STALE_EVENT'
                else 'BINDING_CONFLICT'
              end
         from allowed
       on conflict (event_id) do nothing
       returning processing_state, outcome_code
     )
     select processing_state, outcome_code from inserted_event`,
    [
      update.eventId,
      update.eventType,
      update.eventCreated,
      update.eventOrder,
      update.livemode,
      update.apiVersion,
      update.objectId,
      update.workspaceId,
      update.userId,
      update.customerId,
      update.subscriptionId,
      update.payloadSha256,
      update.status,
      update.priceId,
      VOICE_BETA_ALLOWANCE_SECONDS,
      update.periodStart,
      update.periodEnd,
    ],
  );
  const row = rows[0];
  if (!row) return { state: "duplicate", outcomeCode: "DUPLICATE_EVENT" };
  return { state: row.processing_state, outcomeCode: row.outcome_code };
}

/**
 * Billing truth and provider mutations share the same workspace lease. This
 * prevents a canceled entitlement from racing a Retell bind/activation and
 * prevents an older unbind from completing after a newer reactivation.
 */
export async function applyResolvedVoiceBillingEvent(
  resolution: VoiceBillingResolution,
  sqlOverride?: Sql,
): Promise<{ state: "processed" | "ignored" | "duplicate"; outcomeCode: string }> {
  const sql = sqlOverride ?? (await getSql());
  if (resolution.kind === "ignore") {
    return applyResolvedVoiceBillingEventUnlocked(resolution, sql);
  }
  return withVoiceWorkspaceMutationLease(
    resolution.update.workspaceId,
    `stripe:${resolution.update.eventId}`,
    sql,
    () => applyResolvedVoiceBillingEventUnlocked(resolution, sql),
  );
}

export async function processVoiceStripeEvent(
  event: StripeEventLike,
  rawBody: string,
  deps: {
    sql?: Sql;
    config?: VoiceStripeConfig;
    stripe?: StripeClientLike;
    reconcileWorkspacePolicy?: (
      workspaceId: string,
      sqlOverride?: Sql,
    ) => Promise<{ failed: number }>;
  } = {},
): Promise<{ state: "processed" | "ignored" | "duplicate"; outcomeCode: string }> {
  const config = deps.config ?? getVoiceStripeConfig();
  if (!config) throw new Error("Voice billing is not configured");
  const stripe = deps.stripe ?? (await createVoiceStripeClient(config.secretKey));
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const resolution = await resolveVoiceBillingEvent(
    event,
    payloadSha256,
    config,
    stripe,
  );
  const applied = await applyResolvedVoiceBillingEvent(resolution, deps.sql);
  if (resolution.kind === "apply") {
    const reconcile =
      deps.reconcileWorkspacePolicy ??
      (await import("./maintenance.server")).reconcileWorkspaceVoicePolicy;
    const policy = await reconcile(resolution.update.workspaceId, deps.sql);
    if (policy.failed > 0) {
      throw new Error("Voice provider policy reconciliation failed");
    }
  }
  return applied;
}

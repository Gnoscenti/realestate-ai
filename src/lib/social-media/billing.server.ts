import Stripe from "stripe";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { loadOrshotTemplateConfig } from "./templates.server";

export function socialBillingConfigured(workspaceId: string) {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
    process.env.STRIPE_SOCIAL_WEBHOOK_SECRET?.trim() &&
    /^price_/.test(process.env.STRIPE_SOCIAL_PRICE_ID ?? "") &&
    process.env.BLOB_READ_WRITE_TOKEN &&
    loadOrshotTemplateConfig(workspaceId).configured,
  );
}
export function socialStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Paid rendering setup is incomplete");
  return new Stripe(key);
}
function socialReturnOrigin() {
  const origin = new URL(process.env.SOCIAL_BILLING_RETURN_ORIGIN ?? "");
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && origin.hostname === "localhost"))
  )
    throw new Error("Paid rendering return origin is not configured");
  return origin.origin;
}
export async function startSocialCheckout(userId: string, workspaceId: string, requestId: string) {
  z.uuid().parse(requestId);
  const sql = await getSql();
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  if (!socialBillingConfigured(workspaceId))
    throw new Error("Paid rendering setup is incomplete. Use the free image exporter.");
  const stripe = socialStripeClient();
  const origin = socialReturnOrigin();
  const active = await sql.query(
    "select 1 from workspace_entitlements where workspace_id=$1 and product='social_media' " +
      "and status in ('active','trialing','past_due','paused') and stripe_subscription_id is not null",
    [workspaceId],
  );
  if (active.length) throw new Error("This workspace has a subscription. Use Manage billing.");
  let customer = (
    await sql.query<{ stripe_customer_id: string }>(
      "select stripe_customer_id from social_stripe_customers where workspace_id=$1",
      [workspaceId],
    )
  )[0]?.stripe_customer_id;
  if (!customer) {
    const created = await stripe.customers.create(
      { metadata: { workspace_id: workspaceId, product: "social_media" } },
      { idempotencyKey: "social-customer:" + workspaceId },
    );
    const binding = await sql.query<{ stripe_customer_id: string }>(
      "insert into social_stripe_customers(workspace_id,stripe_customer_id,created_by_user_id) values($1,$2,$3) " +
        "on conflict(workspace_id) do update set workspace_id=excluded.workspace_id returning stripe_customer_id",
      [workspaceId, created.id, userId],
    );
    customer = binding[0].stripe_customer_id;
  }
  const claims = await sql.query<{ request_id: string }>(
    "insert into social_checkout_reservations(workspace_id,request_id,reserved_until) " +
      "values($1,$2,now()+interval '35 minutes') on conflict(workspace_id) do update " +
      "set request_id=excluded.request_id,checkout_url=null,stripe_session_id=null," +
      "reserved_until=excluded.reserved_until,created_at=now() " +
      "where social_checkout_reservations.reserved_until<now() returning request_id",
    [workspaceId, requestId],
  );
  if (!claims.length) {
    const existing = (
      await sql.query<{ checkout_url: string | null }>(
        "select checkout_url from social_checkout_reservations where workspace_id=$1",
        [workspaceId],
      )
    )[0];
    if (existing?.checkout_url) return { url: existing.checkout_url };
    throw new Error(
      "A checkout is already being prepared. Retry shortly; an uncertain checkout is held for 35 minutes.",
    );
  }
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: workspaceId,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      line_items: [{ price: process.env.STRIPE_SOCIAL_PRICE_ID!, quantity: 1 }],
      subscription_data: { metadata: { workspace_id: workspaceId, product: "social_media" } },
      success_url: origin + "/marketing?billing=returned",
      cancel_url: origin + "/marketing",
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto" },
    },
    { idempotencyKey: "social-checkout:" + workspaceId + ":" + requestId },
  );
  if (!session.url) throw new Error("Checkout could not be opened");
  await sql.query(
    "update social_checkout_reservations set checkout_url=$1,stripe_session_id=$2 " +
      "where workspace_id=$3 and request_id=$4",
    [session.url, session.id, workspaceId, requestId],
  );
  return { url: session.url };
}
export async function openSocialBillingPortal(userId: string, workspaceId: string) {
  const sql = await getSql();
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const binding = (
    await sql.query<{ stripe_customer_id: string }>(
      "select stripe_customer_id from social_stripe_customers where workspace_id=$1",
      [workspaceId],
    )
  )[0];
  if (!binding) throw new Error("No paid social subscription is linked");
  const session = await socialStripeClient().billingPortal.sessions.create({
    customer: binding.stripe_customer_id,
    return_url: socialReturnOrigin() + "/marketing",
  });
  return { url: session.url };
}
const subscriptionSchema = z.object({
  id: z.string().startsWith("sub_"),
  customer: z.union([
    z.string().startsWith("cus_"),
    z.object({ id: z.string().startsWith("cus_") }),
  ]),
  status: z.string(),
  metadata: z.object({ workspace_id: z.string().min(1), product: z.literal("social_media") }),
  items: z.object({
    data: z
      .array(
        z.object({
          price: z.object({ id: z.string() }),
          quantity: z.number().optional(),
          current_period_start: z.number().int().positive(),
          current_period_end: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
  latest_invoice: z
    .union([z.string(), z.object({ status: z.string().nullable() })])
    .nullable()
    .optional(),
  pause_collection: z.unknown().optional(),
});
export interface SocialSubscriptionSnapshot {
  workspaceId: string;
  subscriptionId: string;
  customerId: string;
  priceId: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled" | "inactive";
  periodStart: string;
  periodEnd: string;
  units: number;
}
export function socialSubscriptionSnapshot(
  raw: unknown,
  priceId: string,
  units: number,
): SocialSubscriptionSnapshot {
  const sub = subscriptionSchema.parse(raw);
  const item = sub.items.data[0]!;
  const eligible =
    sub.items.data.length === 1 &&
    item.price.id === priceId &&
    (item.quantity ?? 1) === 1 &&
    item.current_period_end > item.current_period_start;
  const paidInvoice =
    typeof sub.latest_invoice === "object" && sub.latest_invoice?.status === "paid";
  let status: SocialSubscriptionSnapshot["status"] = "inactive";
  if (sub.status === "canceled") status = "canceled";
  else if (sub.status === "past_due" || sub.status === "unpaid") status = "past_due";
  else if (sub.status === "paused" || sub.pause_collection) status = "paused";
  else if (eligible && (sub.status === "trialing" || (sub.status === "active" && paidInvoice)))
    status = sub.status;
  return {
    workspaceId: sub.metadata.workspace_id,
    subscriptionId: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    priceId: item.price.id,
    status,
    periodStart: new Date(item.current_period_start * 1000).toISOString(),
    periodEnd: new Date(item.current_period_end * 1000).toISOString(),
    units: eligible && Number.isInteger(units) ? Math.max(0, Math.min(1000, units)) : 0,
  };
}
export async function persistSocialSubscriptionEvent(
  sql: Sql,
  event: { id: string; created: number },
  snapshot: SocialSubscriptionSnapshot,
) {
  // Only a customer previously bound by authenticated server-side checkout may
  // grant this workspace access. Event receipt and entitlement update are atomic.
  const rows = await sql.query<{ accepted: boolean }>(
    "with binding as (select workspace_id from social_stripe_customers where workspace_id=$1 and stripe_customer_id=$2), " +
      "received as (insert into social_stripe_events(event_id,subscription_id,workspace_id,event_created,observed_status) " +
      "select $3,$4,workspace_id,$5,$6 from binding on conflict do nothing returning workspace_id), " +
      "applied as (insert into workspace_entitlements(workspace_id,product,status,stripe_customer_id,stripe_subscription_id," +
      "stripe_price_id,included_units,hard_limit_units,overage_authorized,current_period_start,current_period_end,social_event_created) " +
      "select workspace_id,'social_media',$6,$2,$4,$7,$8,$8,false,$9,$10,$5 from received " +
      "on conflict(workspace_id,product) do update set status=excluded.status,stripe_customer_id=excluded.stripe_customer_id," +
      "stripe_subscription_id=excluded.stripe_subscription_id,stripe_price_id=excluded.stripe_price_id," +
      "included_units=excluded.included_units,hard_limit_units=excluded.hard_limit_units,overage_authorized=false," +
      "current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end," +
      "social_event_created=excluded.social_event_created,updated_at=now() " +
      "where workspace_entitlements.social_event_created<excluded.social_event_created or " +
      "(workspace_entitlements.social_event_created=excluded.social_event_created and excluded.status not in ('active','trialing')) " +
      "returning 1) select exists(select 1 from applied) as accepted",
    [
      snapshot.workspaceId,
      snapshot.customerId,
      event.id,
      snapshot.subscriptionId,
      event.created,
      snapshot.status,
      snapshot.priceId,
      snapshot.units,
      snapshot.periodStart,
      snapshot.periodEnd,
    ],
  );
  return rows[0]?.accepted ?? false;
}
export async function handleSocialStripeWebhook(payload: string, signature: string) {
  const secret = process.env.STRIPE_SOCIAL_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Webhook setup is incomplete");
  const stripe = socialStripeClient();
  const event = stripe.webhooks.constructEvent(payload, signature, secret);
  const live = /(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  if (event.livemode !== live) throw new Error("Webhook mode mismatch");
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.paused",
      "customer.subscription.resumed",
    ].includes(event.type)
  )
    return { received: true, ignored: true };
  const object = event.data.object;
  if (!("id" in object) || typeof object.id !== "string" || !object.id.startsWith("sub_"))
    throw new Error("Invalid subscription event");
  // Retrieve current authoritative state, never trust a stale event snapshot.
  const subscription = await stripe.subscriptions.retrieve(object.id, {
    expand: ["latest_invoice"],
  });
  if (subscription.metadata.product !== "social_media") return { received: true, ignored: true };
  const price = process.env.STRIPE_SOCIAL_PRICE_ID;
  if (!price) throw new Error("Social price is not configured");
  const snapshot = socialSubscriptionSnapshot(
    subscription,
    price,
    Number(process.env.SOCIAL_MEDIA_INCLUDED_RENDERS ?? 50),
  );
  const applied = await persistSocialSubscriptionEvent(await getSql(), event, snapshot);
  return { received: true, applied };
}

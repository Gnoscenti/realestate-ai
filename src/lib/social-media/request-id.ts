export interface SocialImageRequestIdentity {
  intentKey: string;
  requestId: string;
}

export interface SocialImageIntent {
  listingId: string;
  templateKey: string;
  mediaIds: string[];
}

interface RequestIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SOCIAL_IMAGE_REQUEST_STORAGE_KEY =
  "cloud-realtor:social-image-request:v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function socialImageIntentKey(intent: SocialImageIntent): string {
  // Photo order is significant because it determines the lead/template slots.
  return JSON.stringify([
    intent.listingId,
    intent.templateKey,
    ...intent.mediaIds,
  ]);
}

/** Preserve one idempotency UUID for an unchanged billable render intent. */
export function requestIdentityForSocialImage(
  current: SocialImageRequestIdentity | null,
  intent: SocialImageIntent,
  createRequestId: () => string,
): SocialImageRequestIdentity {
  const intentKey = socialImageIntentKey(intent);
  return current?.intentKey === intentKey
    ? current
    : { intentKey, requestId: createRequestId() };
}

export function readSocialImageRequestIdentity(
  storage: RequestIdentityStorage,
): SocialImageRequestIdentity | null {
  try {
    const raw = storage.getItem(SOCIAL_IMAGE_REQUEST_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SocialImageRequestIdentity>;
    return typeof value.intentKey === "string" &&
      value.intentKey.length > 0 &&
      value.intentKey.length <= 8_192 &&
      typeof value.requestId === "string" &&
      UUID_PATTERN.test(value.requestId)
      ? { intentKey: value.intentKey, requestId: value.requestId }
      : null;
  } catch {
    return null;
  }
}

export function persistSocialImageRequestIdentity(
  storage: RequestIdentityStorage,
  identity: SocialImageRequestIdentity,
): void {
  try {
    storage.setItem(SOCIAL_IMAGE_REQUEST_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage can be disabled or full. Server intent locking remains the safety
    // backstop even when this refresh convenience is unavailable.
  }
}

export function clearSocialImageRequestIdentity(
  storage: RequestIdentityStorage,
): void {
  try {
    storage.removeItem(SOCIAL_IMAGE_REQUEST_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

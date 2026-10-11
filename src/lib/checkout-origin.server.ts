import { getRequest } from "@tanstack/react-start/server";

function appOrigin(): string {
  const request = getRequest();
  if (!request) throw new Error("Checkout request context is unavailable");
  return new URL(request.url).origin;
}

function validateReturnUrl(rawUrl: string, expectedOrigin: string): string {
  const url = new URL(rawUrl);
  if (url.username || url.password || url.origin !== expectedOrigin) {
    throw new Error("Checkout return URLs must use this app's origin");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error("Checkout return URLs must use HTTPS");
  }
  url.hash = "";
  return url.toString();
}

export function assertCheckoutReturnUrls(input: {
  successUrl: string;
  cancelUrl: string;
}): { successUrl: string; cancelUrl: string } {
  const expectedOrigin = appOrigin();
  return {
    successUrl: validateReturnUrl(input.successUrl, expectedOrigin),
    cancelUrl: validateReturnUrl(input.cancelUrl, expectedOrigin),
  };
}

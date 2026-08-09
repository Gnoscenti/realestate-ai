export type FormSubmitResponseKind =
  | "success"
  | "activation"
  | "endpoint_not_found"
  | "error";

export type FormSubmitClassification = {
  kind: FormSubmitResponseKind;
  message: string;
};

export function isFormSubmitActivationResponse(text: string): boolean {
  const value = text.toLowerCase();
  return (
    value.includes("activation") ||
    value.includes("confirm") ||
    value.includes("token not found") ||
    value.includes("not a valid link") ||
    value.includes("activate your form") ||
    value.includes("check your email")
  );
}

/**
 * Keep browser and server interpretation of FormSubmit responses identical.
 * A 422 is activation-related; a bare 404 is an endpoint/configuration error.
 */
export function classifyFormSubmitResponse(
  status: number,
  ok: boolean,
  raw: string,
): FormSubmitClassification {
  let json: { success?: string | boolean; message?: string } | null = null;
  try {
    json = JSON.parse(raw) as {
      success?: string | boolean;
      message?: string;
    };
  } catch {
    /* non-JSON */
  }

  const message = String(json?.message || raw || "");
  const needsActivation =
    status === 422 || isFormSubmitActivationResponse(message);
  const success =
    json?.success === true ||
    json?.success === "true" ||
    /success|ok|thank/i.test(message);

  if (ok && success && !needsActivation) {
    return { kind: "success", message };
  }
  if (needsActivation) {
    return { kind: "activation", message };
  }
  if (status === 404) {
    return { kind: "endpoint_not_found", message };
  }
  return { kind: "error", message };
}

import { describe, expect, it } from "vitest";
import {
  classifyFormSubmitResponse,
  isFormSubmitActivationResponse,
} from "@/lib/formsubmit";

describe("classifyFormSubmitResponse", () => {
  it("accepts a successful AJAX response", () => {
    expect(
      classifyFormSubmitResponse(
        200,
        true,
        JSON.stringify({ success: "true", message: "Thank you" }),
      ),
    ).toEqual({ kind: "success", message: "Thank you" });
  });

  it("detects activation text even on a 200 response", () => {
    expect(
      classifyFormSubmitResponse(
        200,
        true,
        JSON.stringify({
          success: "false",
          message: "Check your email to activate your form",
        }),
      ).kind,
    ).toBe("activation");
  });

  it("treats HTTP 422 as activation-required", () => {
    expect(classifyFormSubmitResponse(422, false, "Unprocessable").kind).toBe(
      "activation",
    );
  });

  it("treats a bare HTTP 404 as endpoint configuration failure", () => {
    expect(classifyFormSubmitResponse(404, false, "Not Found").kind).toBe(
      "endpoint_not_found",
    );
  });

  it("recognizes the known token failure messages", () => {
    expect(isFormSubmitActivationResponse("Token not found")).toBe(true);
    expect(isFormSubmitActivationResponse("This is not a valid link")).toBe(
      true,
    );
  });
});

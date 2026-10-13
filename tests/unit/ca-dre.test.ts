import { describe, expect, it } from "vitest";
import {
  caDreRecordMatchesPerson,
  parseCaDreRecord,
} from "@/lib/aieo/ca-dre.server";

const AGENT_HTML = `<html><body><table>
  <tr><th>License Type:</th><td>SALESPERSON</td></tr>
  <tr><th>Name:</th><td>AGENT, SAN DIEGO PILOT</td></tr>
  <tr><th>License ID:</th><td>01234567</td></tr>
  <tr><th>Expiration Date:</th><td>10/06/29</td></tr>
  <tr><th>License Status:</th><td>LICENSED</td></tr>
  <tr><th>Responsible Broker:</th><td>License ID:</td></tr>
  <tr><td><a href="?License_id=01999999">01999999</a></td></tr>
  <tr><td>PACIFIC COAST REAL ESTATE INC</td></tr>
  <tr><td>1200 TEST CENTER DR, SAN DIEGO, CA 92101</td></tr>
</table></body></html>`;

describe("California DRE parser", () => {
  it("keeps the person and linked broker identifiers separate", () => {
    const record = parseCaDreRecord(AGENT_HTML);
    expect(record).toEqual({
      licenseId: "01234567",
      name: "AGENT, SAN DIEGO PILOT",
      licenseType: "SALESPERSON",
      status: "LICENSED",
      expiresOn: "2029-10-06",
      responsibleBrokerLicense: "01999999",
      responsibleBrokerName: "PACIFIC COAST REAL ESTATE INC",
    });
    expect(caDreRecordMatchesPerson(record!, "San Diego Pilot Agent")).toBe(true);
  });

  it("rejects a different person and a corporation as the submitted agent", () => {
    const record = parseCaDreRecord(AGENT_HTML)!;
    expect(caDreRecordMatchesPerson(record, "Different Agent")).toBe(false);
    expect(
      caDreRecordMatchesPerson(
        { ...record, licenseType: "REAL ESTATE BROKER" },
        "San Diego Pilot Agent",
      ),
    ).toBe(true);
    expect(
      caDreRecordMatchesPerson(
        { ...record, name: "PACIFIC COAST REAL ESTATE INC", licenseType: "CORPORATION" },
        "Pacific Coast Real Estate Inc",
      ),
    ).toBe(false);
    expect(
      caDreRecordMatchesPerson(
        { ...record, licenseType: "APPRAISER" },
        "San Diego Pilot Agent",
      ),
    ).toBe(false);
  });

  it("preserves expired and restricted registry states for fail-closed scoring", () => {
    const record = parseCaDreRecord(
      AGENT_HTML
        .replace("LICENSED</td>", "RESTRICTED</td>")
        .replace("10/06/29", "01/01/25"),
    );
    expect(record).toMatchObject({ status: "RESTRICTED", expiresOn: "2025-01-01" });
  });

  it("returns null for malformed or wrong-shape records", () => {
    expect(parseCaDreRecord("<html><body>No matching record</body></html>")).toBeNull();
  });
});

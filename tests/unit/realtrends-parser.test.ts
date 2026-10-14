import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseRealTrendsProduction } from "../../src/lib/aieo/realtrends-parser";

// Synthetic layout reproduction of the public profile labels, not a captured response.
const performance = `<h2>RealTrends Verified Performance</h2>
  <p>Based On 2025 Sales Data</p>
  <div>Sides</div><div>20</div><div>Volume</div><div>$33.61M</div>`;

describe("RealTrends production provenance", () => {
  it("preserves 20 sides when national, state and city ranking numbers follow", () => {
    const result = parseRealTrendsProduction(`${performance}
      <div>National</div><div>Volume Rank</div><div>2901</div><div>Sides Rank</div><div>-</div>
      <div>State</div><div>Volume Rank</div><div>853</div><div>Sides Rank</div><div>-</div>
      <div>City</div><div>Volume Rank</div><div>5</div><div>Sides Rank</div><div>1</div>
      <div>Awards</div><div>Market Update for October 4, 2026</div>`);
    assert.deepEqual(result, [
      { claimScope: "sales-sides:2025:full-year", field: "transaction_sides", value: "20 sides in 2025" },
      { claimScope: "sales-volume:2025:full-year", field: "transaction_volume", value: "$33,610,000 in 2025" },
    ]);
  });

  it("never uses a copyright or market-update year to date latest figures", () => {
    assert.deepEqual(parseRealTrendsProduction(`<p>© 2026 HW Media</p>
      <div>Latest Volume</div><div>$33.61M</div><div>Latest Transactions</div><div>20</div>
      <p>Market Update for October 4, 2026</p><div>Sides</div><div>1</div>`), []);
  });

  it("retains the original year-scoped production layout", () => {
    assert.deepEqual(parseRealTrendsProduction(`<h2>2025 Rankings</h2>
      <div><span>Sales Volume</span><span>$33,614,777</span></div>
      <div><span>Transaction Sides</span><span>20</span></div>`).map(row => row.value),
    ["20 sides in 2025", "$33,614,777 in 2025"]);
  });

  it("accepts an explicitly year-scoped metric without borrowing a nearby year", () => {
    assert.deepEqual(parseRealTrendsProduction("<div>2025 Transaction Sides</div><div>20</div>").map(row => row.value), ["20 sides in 2025"]);
  });

  it("fails closed on ambiguous figures instead of retaining the last number", () => {
    assert.deepEqual(parseRealTrendsProduction(`${performance}<div>Sides</div><div>21</div>`).map(row => row.field), ["transaction_volume"]);
  });

  it("does not treat ranks, years, dollar figures or script text as sides", () => {
    for (const raw of ["Sides Rank 1", "Sides</div><div>2025", "Sides</div><div>$20", "<script>Sides 20</script>"]) {
      assert.deepEqual(parseRealTrendsProduction(`<p>Based On 2025 Sales Data</p><div>${raw}</div>`), []);
    }
  });

  it("keeps multiple production years separate", () => {
    const result = parseRealTrendsProduction(`${performance}<h2>2024 Rankings</h2><div>Sides</div><div>15</div>`);
    assert.equal(result.find(row => row.claimScope === "sales-sides:2024:full-year")?.value, "15 sides in 2024");
    assert.equal(result.find(row => row.claimScope === "sales-sides:2025:full-year")?.value, "20 sides in 2025");
  });
});

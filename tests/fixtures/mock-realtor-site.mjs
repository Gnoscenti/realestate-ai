/**
 * Tiny HTTP server that mimics a realtor marketing site (JSON-LD + listings).
 * Used by unit integration tests and Playwright e2e.
 *
 *   node tests/fixtures/mock-realtor-site.mjs [port]
 *   import { startMockRealtorSite } from './mock-realtor-site.mjs'
 */
import http from "node:http";

const HOME = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Morgan Hale | Rancho Santa Fe Real Estate</title>
  <meta property="og:image" content="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200"/>
  <meta property="og:description" content="Luxury specialist. DRE 01888777."/>
  <script type="application/ld+json">
  {
    "@type": "RealEstateAgent",
    "name": "Morgan Hale",
    "telephone": "(858) 555-0142",
    "email": "morgan@halehomes.test",
    "image": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
    "jobTitle": "Realtor",
    "worksFor": { "name": "Compass" }
  }
  </script>
  <script type="application/ld+json">
  {
    "@type": "RealEstateListing",
    "name": "Fairbanks Estate",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "16808 Circa Del Norte",
      "addressLocality": "Rancho Santa Fe"
    },
    "offers": { "@type": "Offer", "price": "9250000" },
    "numberOfBedrooms": 6,
    "numberOfBathroomsTotal": 7
  }
  </script>
</head>
<body>
  <nav>
    <a href="/listings">Listings</a>
    <a href="/about">About</a>
  </nav>
  <a href="tel:8585550142">Call</a>
  <a href="mailto:morgan@halehomes.test">Email</a>
  <article>$6,495,000 · 5 bd 5.5 ba · 18422 Via de Fortuna Street, Rancho Santa Fe · MLS# SDP2500888</article>
  <article>$3,200,000 · 4 bd 4 ba · 12345 El Camino Real Street · Coming soon</article>
  <p>CalBRE 01888777 · Serving Covenant and Fairbanks Ranch</p>
</body>
</html>`;

const LISTINGS = `<!DOCTYPE html>
<html><head><title>Listings · Morgan Hale</title></head>
<body>
  <h1>Active inventory</h1>
  <p>$8,100,000 · 7 bd 8 ba · 7010 Las Colinas Ranch Road Street</p>
  <p>$2,890,000 · 3 bd 3 ba · 441 Via del Norte Street · Pending</p>
</body></html>`;

const ABOUT = HOME;

/**
 * @param {number} [port=0] 0 = ephemeral
 * @returns {Promise<{ port: number, url: string, close: () => Promise<void> }>}
 */
export function startMockRealtorSite(port = 0) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const path = req.url?.split("?")[0] || "/";
    if (path.startsWith("/listings")) res.end(LISTINGS);
    else if (path.startsWith("/about")) res.end(ABOUT);
    else res.end(HOME);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: p,
        url: `http://127.0.0.1:${p}`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

// CLI: node tests/fixtures/mock-realtor-site.mjs 9878
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("mock-realtor-site.mjs")) {
  const port = Number(process.argv[2] || 9878);
  const site = await startMockRealtorSite(port);
  console.log(`mock realtor site on ${site.url}`);
}

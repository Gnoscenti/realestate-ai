import http from "node:http";

/** Synthetic person pages: no external account or listing data. */
export async function startOnboardingPages({ name = "Avery Onboarding" } = {}) {
  const person = {
    "@type": "Person",
    name,
    telephone: "5035550123",
    email: "avery@onboarding.test",
    image: "/portrait.svg",
    jobTitle: "Real estate agent",
    worksFor: { "@type": "Organization", name: "Example Coast Realty" },
    areaServed: { "@type": "City", name: "Portland, OR" },
    description: "Helping clients understand their next move.",
    sameAs: ["https://social.example/avery"],
  };
  const html = (data, body = "") =>
    `<!doctype html><html><head><title>${data.name} | Real estate</title><script type="application/ld+json">${JSON.stringify(data)}</script></head><body><h1>${data.name}</h1>${body}<footer>Example Coast Realty — office@onboarding.test — Responsible Broker DRE #00999999</footer></body></html>`;
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    switch (request.url) {
      case "/portrait.svg":
        response.setHeader("Content-Type", "image/svg+xml");
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#35746b"/><text x="20" y="50" fill="white">AO</text></svg>',
        );
        break;
      case "/bio":
        response.end(
          html(
            { ...person, telephone: "5035550456" },
            `<p>${person.name} — MLS Agent ID: AO12345</p>`,
          ),
        );
        break;
      case "/wrong":
        response.end(
          html({
            ...person,
            name: "Blair Different",
            telephone: "5035550999",
            email: "blair@onboarding.test",
          }),
        );
        break;
      case "/blocked":
        response.statusCode = 403;
        response.end("Reading blocked by this synthetic fixture.");
        break;
      case "/slow":
        setTimeout(() => response.end(html({ ...person, name: "Late Response" })), 1000);
        break;
      default:
        response.end(html(person));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((resolve) => server.close(resolve)) };
}

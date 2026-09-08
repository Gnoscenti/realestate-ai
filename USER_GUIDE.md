# RealEstate AI — User Guide

**Who this is for:** agents and brokerage marketers who want to know where AI answers send their clients and
publish factual content without a compliance headache.

**What the app does not do:** it does not pull MLS data, it does not invent listings, clients, reviews, or
statistics, and it never marks anything "published" that it did not publish or that you did not confirm.

---

## 1. First 10 minutes

1. **Sign in** with email and password (or the broker login if your team enabled it).
2. **Unlock access** with the beta code your team gave you, or the one-time $9.99 checkout. The server records
   the grant; it follows your account across devices.
3. **Add your profile** from the sidebar: name, market area, public website. Optional: brokerage and license
   number. Website scan pulls your photo, phone, and any listings shown on your site (labeled "observed").

## 2. CiteLock — where you show up in AI answers

Open **CiteLock** in the sidebar.

- **Run visibility batch.** CiteLock asks the configured answer engines seven questions: five unbranded client
  questions about your market (choosing an agent, selling, relocating, luxury, brokerages) and two branded checks
  (who you are, whether you are licensed). It stores every answer verbatim with the provider's own citations,
  the model that answered, latency, and cost. A batch takes a few minutes; you can stop it after the current
  probes.
- **Where you show up** shows three rates, each with numerator/denominator: discovery (unbranded answers that
  named you), citation (answers citing a page you control), identity accuracy (branded answers consistent with
  your brokerage/license/site). Below: per-intent results, who the engines recommended instead, and which
  sources they relied on. Green means a source you control.
- **What to fix** ranks opportunities with a transparent formula (gap × reach × actionability × fit). For each,
  you can build a profile-claim checklist, draft a web page or FAQ from facts you list, or open the Social Desk.
  Drafts are proposed → you approve → you publish → paste the live URL → CiteLock verifies the text is on the
  page.
- **Readiness** is the diagnostic panel: site audit, California DRE license check, evidence coverage, publishing
  gates, and a schema export that unlocks only when every gate passes.
- **Repeat.** Run another batch after publishing. The trend table compares the same question basket over time.

Limits, stated in the app: these are API observations of the engines' web-grounded surfaces, not the consumer
ChatGPT or Gemini apps; questions are designed research questions, not measured demand; competitor names are
model-extracted; small samples are descriptive.

## 3. Social Desk — draft, review, approve, publish

Open **Social Desk**.

1. Pick platform, goal, voice, and optionally a listing on record. The facts on record are listed.
2. Type your own facts (open-house time you set, what buyers said, what the seller completed). **Required.**
3. **Draft with AI** (when the server has a key) or write the caption yourself. The draft shows which facts it
   used and which claims it deliberately did not make.
4. The **fair-housing and claims review** flags risky phrases. Blocking findings must be fixed before approval.
5. **Save**, then **Approve facts, rights, and text**. Editing later creates a new revision and returns to draft.
6. Publish:
   - **Postiz** (your own scheduler that holds the Instagram/LinkedIn/Facebook/X authorizations): connect once
     with your Postiz API key, choose a channel, optionally schedule, and publish. Check status to see when it
     went live.
   - **Manual handoff**: copy, share, or download the approved text, post it yourself, then paste the live post
     URL as your receipt.

## 4. Everything else

| Section | What it is |
| --- | --- |
| Command Center | Ranked next actions built from your own leads, listings, deals, and appointments. |
| Instant Response | Copy-ready first-touch scripts. Nothing is sent for you. |
| Lead Intelligence | Your contacts with a rule-based score. Call/email/message buttons open your phone apps and log a touch. |
| Listings & Data | Website listings (observed), CSV imports, and Zillow-via-RapidAPI market observations (unverified). |
| CMA Studio / Market | Arithmetic over your own inventory. Not an appraisal or an AVM product. |
| Calendar & Vendors | Your appointments and your vendor list. Calendar "connect" imports nothing. |
| Transaction Hub | Manual milestones. Document review and e-signature are not connected. |
| Email Alerts | Gmail scan for the session only when you paste a token. Nothing is stored or invented. |
| Feedback Board | Local notes for you; the "Suggest" drawer sends feedback to the team. |

## 5. Data and trust

- Your CiteLock batches, drafts, and grants live on the server under your workspace. Local CRM notes stay in the
  browser you used.
- Nothing is deleted automatically. Practice or seed data is removed only when you choose to.
- Provider costs are shown per batch and capped per day.

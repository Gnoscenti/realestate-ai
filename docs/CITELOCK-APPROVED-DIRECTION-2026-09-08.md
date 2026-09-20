Superseding project direction: Citelock, approved workarounds, and completion of existing work
This is an explicit update to the project’s requirements and execution process. It supersedes earlier user-level plans, assumptions, documentation, and acceptance criteria wherever they contradict the decisions below. It does not override system instructions, security requirements, or authorization boundaries.
Continue the other work you are already doing. Do not restart the project, abandon your current implementation, discard changes, or replace the entire existing plan. Reconcile your current work with these decisions, change only the conflicting portions, and continue through implementation and verification.
1. Working trees and continuity
Use these local folders:
- Z:/home/ttroj/code/realestate-ai/
- Z:/home/ttroj/code/geo-aeo-platform/
Their WSL equivalents are:
- /home/ttroj/code/realestate-ai/
- /home/ttroj/code/geo-aeo-platform/
The local working trees—not GitHub, an older branch, or an earlier task summary—are the source of truth. Preserve existing uncommitted work.
Read these existing notes before re-deriving decisions:
- realestate-ai/docs/FLAGSHIP-LEDGER.md
- realestate-ai/docs/FLAGSHIP-BLOCKERS.md
- realestate-ai/docs/CITELOCK-VISIBILITY-DESIGN.md
Check the current files against the notes because another instance may have made additional changes. Do not repeat the full repository audit where adequate findings already exist; verify affected areas and investigate unresolved gaps.
Maintain the ledger as you work. Record decisions, implementation status, verification evidence, and remaining dependencies. Distinguish historical test results from checks you personally run against the current tree.
2. Citelock’s corrected purpose: improve discovery, not merely assess readiness
Citelock is a real-estate-specific GEO/AIEO discovery-and-improvement product. An assessment-only release does not satisfy the flagship requirement.
The value proposition is:
Get discovered for the work you do best.

The operational promise is:
Identify where AI searches overlook an agent’s or brokerage’s supported expertise, create targeted improvements to its public presence, and measure whether those changes improve discovery.

A profile recap, credential checklist, schema generator, or readiness score may support this workflow. None is sufficient as the primary outcome.
Do not continue an older plan that treats “evidence-backed assessment with follow-up” as a substitute for actionable visibility improvement.
Implement this connected workflow:
A. Discover supported expertise
Inspect the agent’s or brokerage’s website, accurately matched public profiles, permitted client comments/reviews, and authorized case material.
Identify specific differentiators such as:
- Communication and responsiveness.
- Explaining difficult decisions.
- Negotiation process and handling complications.
- Experience with particular property types and local conditions.
- Buyer or seller situations actually handled.
- Consistent client-experience themes, including contradictory or negative evidence.
Attach sources, observation dates, and uncertainty. Separate the individual agent, team, and brokerage. Do not transfer one entity’s experience to another without support.
Missing evidence means “unknown” or “insufficient evidence,” not poor quality.
B. Test real discovery
Build a versioned basket of relevant client questions based on geography, property needs, transaction stage, and supported expertise.
Use unbranded discovery questions to test whether the agent appears. Do not insert the agent’s name or biography into those prompts or hidden context.
Keep named reputation questions separate.
Use supported, web-grounded provider integrations. Record the actual prompt, returned model, provider, timestamp, answer, citation metadata, usage, and failures.
Separate:
- Mention.
- Recommendation.
- Linked citation.
- Ambiguous identity.
- Negative mention.
- Failed observation.
An API observation is not automatically a measurement of the corresponding consumer application. Label the measurement surface honestly. A URL generated in prose is not sufficient evidence of a grounded citation.
C. Find actionable visibility gaps
Compare:
1. The agent’s supported expertise.
2. What their public pages actually communicate.
3. What sampled answers recommend and cite for relevant competitors.
Identify concrete opportunities involving identity inconsistencies, inaccessible content, missing expertise coverage, stale information, or insufficient corroboration.
Each opportunity must explain:
- The client question or question category.
- What was observed.
- Which sources support the finding.
- The relevant expertise.
- The specific public-content gap.
- The proposed intervention.
- Why that intervention is plausible.
- How its result will be tested.
Do not claim access to an engine’s private ranking logic. Separate observations from hypotheses.
D. Produce the improvement
Do not stop at “add keywords” or a generic checklist.
Produce usable, reviewable artifacts:
- Exact website or brokerage-profile edits.
- Useful expertise pages and FAQs.
- Case-study drafts or interview outlines.
- Source-linked social drafts.
- Appropriate internal-link and identity corrections.
- Deployment instructions or authorized publishing actions.
Do not invent testimonials, case details, credentials, transaction outcomes, or expertise. Turn missing facts into explicit requests for evidence within the workflow.
E. Measure follow-through and results
Track approval, publication/handoff, live-page confirmation, and subsequent observations.
Compare a stable question basket across comparable configurations and dates. Keep mention, recommendation, and citation rates separate. Show sample sizes, failed requests, and limitations.
Do not count cached answers or duplicate retries as fresh independent observations. Do not turn a single favorable rerun into a demonstrated lift claim.
Where available, connect results to real referral traffic and qualified inquiries. Do not fabricate attribution.
Release acceptance requires an evidence-supported discovery opportunity and a usable improvement—not just a score. Demonstrated visibility lift must remain unclaimed until measured.
3. Agent quality is not transaction volume
Do not use sold volume as the principal measure of agent quality or as a gate to Citelock value.
Prioritize supported client experience, problem-specific expertise, and relevance to the client’s situation.
Average sale price may describe market experience, but it must not automatically imply better service, greater competence, neighborhood desirability, or transaction complexity.
Where supported, show:
- Mean and median observed closed-sale price.
- Sample size and time period.
- Price distribution.
- Individual versus team attribution.
- Buyer versus seller representation.
- Source and coverage limitations.
Use those facts for client-fit and market context, not a “more expensive means better agent” ranking.
Treat reviews as client-reported evidence. Preserve source coverage, selection bias, duplicates, contradictory themes, and uncertainty. Do not fabricate reviews or assume permission to republish them.
4. MLS authorization is a deferred integration—not a blocker for the rest of the product
The user has explicitly approved RapidAPI as the current real-data workaround. Use it.
Do not repeatedly stop implementation because MLS, RESO-provider, or RealTrends authorization is missing.
There is no universal RESO token that independently grants MLS data rights. RESO tooling is an integration resource, not an authorization workaround.
For the current release:
- Use the available RapidAPI real-estate integration for supported live-data functions.
- Reuse compatible work from the local RapidAPI branch selectively.
- Do not switch branches or overwrite newer local work wholesale.
- Validate actual responses and supported fields.
- Keep credentials server-side.
- Retain bounded requests, caching, quotas, and clear errors.
- Expose the working integration in the product so users can actually use it.
Label the data accurately, for example:
“Third-party property data via RapidAPI.”

Do not label it MLS verified, independently verified production, or proof of personal transaction ownership.
Also expose useful supported alternatives:
- Public website observations.
- User-entered facts clearly labeled as declarations.
- Agent-supplied materials with source and permission information.
- Manual publishing/export where direct provider access is unavailable.
Missing MLS authorization must not disable unrelated Citelock analysis, social workflows, public-site analysis, or supported RapidAPI functionality.
Remove misleading MLS verification claims and prevent unauthorized MLS-dependent execution. Preserve historical records and reusable integration code safely.
Keep licensed MLS and RealTrends integrations behind explicit future activation gates. Do not leave simulated success paths active. Do not delete useful functioning features merely because a different provider integration is unavailable.
5. Social is part of the visibility workflow
Continue completing the social functionality alongside Citelock.
Social should help distribute supported expertise and useful content arising from visibility opportunities—not produce disconnected generic posts or invented listing facts.
Inspect existing work before duplicating it, including:
- migrations/0009_social_desk.sql
- src/lib/social-desk/types.ts
- src/lib/social-desk/repository.server.ts
- src/lib/social-desk/api.ts
These files were started in the other instance. Their presence is not proof of completed UI integration or runtime verification.
Finish the workflow with:
- Authenticated, workspace-isolated persistence.
- Editable drafts and source/fact notes.
- Validation and platform constraints.
- Explicit fact and rights review.
- Revision-aware approval.
- Approval invalidation after edits.
- Loading, empty, success, and error states.
- Export/manual handoff.
- Clearly labeled user-reported publication receipts.
- Critical backend and browser tests.
Manual handoff is an accepted functioning workaround while direct publishing authorization is unavailable.
Do not call a handle-only connection OAuth. Do not call a local status update publication. Do not imply media reuse rights from access to an aggregator image.
If real authorized publishing already works in your current implementation, preserve it and verify it. Do not downgrade functioning integrations unnecessarily.
6. Continue all other assigned work
This direction changes the process and conflicting requirements; it does not cancel your existing obligations.
Keep completing the other work already assigned, including applicable backend, frontend, authentication, authorization, persistence, billing, calendar, configuration, CI, accessibility, security, and deployment-readiness tasks.
Classify dependencies correctly:
- Implement now: work that can be completed within current authorization and available interfaces.
- Accepted workaround: a real alternative that must be implemented and exposed.
- Deferred external integration: requires credentials, a contract, provider review, or another external action.
- Release-critical defect: a correctness, security, durability, or false-success issue that still requires resolution.
A deferred provider integration must not become a blanket blocker.
Likewise, “stop blocking on MLS” does not authorize weakening authentication, bypassing licensing, accepting unsafe outbound requests, fabricating data, or claiming unavailable functionality.
Do not request decisions already settled in this prompt. Make bounded engineering decisions, record them, and proceed. Escalate only genuinely new authority requirements or material conflicts that cannot safely be resolved.
7. Verification and delivery
Implement—not merely document—the revised direction.
Run the strongest relevant checks available against the current working tree:
- Type checking.
- Lint.
- Unit and database integration tests.
- Production build.
- Browser workflow checks.
- Bounded live-provider checks where authorized and configured.
Do not suppress failures, weaken types, or bypass security to pass checks.
Never print credentials. Use existing ignored secret files or configured secret stores; do not copy credentials into source, notes, tests, or client bundles.
Keep the final report explicit about:
- Implemented.
- Tested.
- Manually verified.
- Inferred.
- Recommended.
- Deferred pending external access.
- Not yet completed.
Do not claim the flagship is complete because documentation or scaffolding exists. Do not claim visibility lift without evidence. Do not stop useful implementation merely because MLS or RealTrends access remains pending.
Your immediate action is to reconcile this direction with your current plan and local changes, update the ledger, and continue the implementation you are already performing.
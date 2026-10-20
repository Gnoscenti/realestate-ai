# ADR: fractionalization as an optional workspace extension

Status: accepted for local simulation; live issuance deferred.
Date: 2026-10-20.

## Context and decision

Use the existing Transactions surface for an optional, explicitly labeled fractionalization lab. Keep CiteLock's source-backed realtor/broker guidance and Social Desk's actual marketing workflow intact. A listing is a useful reference for a proposed offering; it does not prove ownership, seller consent or the right to issue an investment interest.

The proposed story needs one correction: CiteLock currently evaluates realtor/broker visibility and source-backed claims. It is not a title service or a general property-accuracy certification. For an SDAR demonstration, use: **Discover the agent → enhance listing content → track the transaction → explore fractionalization readiness.** “Discover → Enhance → Tokenize” is a future product vision, not a claim that this release issues securities.

## Implemented architecture

- `src/lib/compliance-ledger/`: strict command schemas, exact six-decimal integer arithmetic, pure simulation engine, authenticated server functions, workspace-scoped repository.
- `migrations/0020_rwa_sandbox.sql`: listing-linked cases and immutable-by-application audit events. 0017 was already occupied. Listing IDs are text, not universally UUIDs. Composite foreign keys prevent cross-workspace linkage.
- `src/components/compliance-ledger/sandbox-panel.tsx`: Transactions tab with loading, empty, error/reload, success, four-step tracker, export and audit history. Account changes unmount prior state.
- `contracts/`: isolated Foundry sub-workspace with immutable upstream dependency revisions, local-only token extension/factory and actual ERC-3643/ONCHAINID signed-claim tests. It is not bundled into the application and is not invoked by the browser.

The web simulation uses a server-side database. Development normally uses PGLite; deployed environments require Postgres. Every read/write uses the authenticated session, with mutation role checks. Commands carry a UUID idempotency key and expected revision; row locks serialize transitions. Failed commands roll back state and audit events together. Claims expire after24hours; revocation/expiry blocks deposits and allocations, while refunds remain available. Amounts are decimal strings converted to integer micro-units, never floating-point balances. Limits:25investors,1000 ordinary actions per case,1million testUSDC outstanding per case. After the action limit, only revocation of a remaining approved claim and a full escrow refund are allowed per investor. This reserves at most50 additional audited cleanup events; partial refunds, repeated revocation and new claims/funds cannot consume that reserve.

The database enforces simulation mode, local-chain marker31337 and a NULL contract address. No address or transaction hash is fabricated. The marker describes a simulation namespace, not an RPC connection. Claims are explicitly mock claims; there is no field asserting SDAR KYC certification. One testUSDC per simulated unit is an illustrative arithmetic convention, not pricing, ownership percentage or investment advice.

## Alternatives and tradeoffs

| Approach | Value | Decision |
| --- | --- | --- |
| Unified app with live Base issuance immediately | Potential investment workflow, but missing issuer, custody, legal terms, provider and operational design | Defer |
| Browser-only staged animation | Quick demo but cannot demonstrate persistence, authorization, audit history or financial invariants | Reject |
| Authenticated simulation plus separate real-contract harness | Demonstrates workflow and enforcement concepts without pretending approvals or settlement exist | Implement |
| Partner with an established issuance/custody platform | Likely faster path to a defensible real offering than building all regulated operations | Recommend evaluation when a real issuer/use case exists |

Keep SaaS billing and any future investment settlement separate. A Stripe subscription or app beta entitlement does not establish investor eligibility. Calendar notes and transaction milestones do not authorize an offering. Do not trigger minting when a manual transaction stage advances.

## Enable and demonstrate

Development enables the simulation by default; `COMPLIANCE_SANDBOX_ENABLED=0` disables it. Production requires explicit `COMPLIANCE_SANDBOX_ENABLED=1` and migration0020. The flag only enables simulation; it never enables a live chain. No new secret or API key is required.

1. Start the app with the existing local environment and sign in normally.
2. In Social Desk, save a property title/address using the existing property/photo workflow. Use a fictional reference for demonstrations; do not claim marketing rights to a property you do not represent.
3. Open Transactions → Fractionalization lab. Select the saved property and choose **Generate Fractional Compliance Engine**.
4. State that this is a simulation. Run the mock identity check using the fictional test wallet.
5. Simulate a250testUSDC deposit; allocate100units. Show150remaining. Reload to demonstrate durable server state.
6. Revoke the mock claim. Allocation is blocked; refund the remaining testbalance. Export the labeled audit history.
7. If presenting to developers, run `bash contracts/install.sh` and `forge test --root contracts -vv`. Explain that real cryptographic signatures are exercised only in the local test EVM.

The browser walkthrough does not issue a cryptographic on-chain claim. The separate contract tests demonstrate that behavior with fictional signed data. No mainnet/testnet broadcast, payment, external publication or real identity lookup occurs.

## Live issuance boundary and open work

A live product needs defined issuer/SPV ownership and rights, reviewed offering terms and permitted distribution, a real KYC/AML/eligibility provider and trusted claim issuer, custody/escrow, audited contracts and jurisdiction-specific policy, key management, and chain-event ingestion with confirmation/reorg/replay handling. Contract addresses must be validated against chain receipts and bytecode before mapping into production records. Secrets/keys must never enter browser storage. Product value should be validated against a real issuer workflow before expanding this beyond the lab.

ERC-3643 contains token, identity, claim-topic, trusted-issuer, storage and compliance interfaces; an identity boolean is not a substitute. Its agent mint/recovery powers require explicit operational governance. The local test uses DefaultCompliance as a permissive fixture, not a jurisdiction policy. [ERC-3643 standard](https://eips.ethereum.org/EIPS/eip-3643).

The original TokenySolutions/T-REX repository is deprecated and redirects developers to ERC-3643/ERC-3643. This workspace pins the latter; Solidity licensing requires review before distribution of a derivative. [Original repository notice](https://github.com/TokenySolutions/T-REX), [maintained repository](https://github.com/ERC-3643/ERC-3643).

Base's network IDs are8453(mainnet) and84532(Sepolia). The harness deliberately permits only31337. [Base network documentation](https://docs.base.org/get-started/connect-to-base).

Tokenization changes representation; it does not itself remove securities-law obligations or establish rights in an underlying property. The SEC discusses issuer-sponsored and third-party structures separately. This design deliberately leaves offering decisions to the issuer and appropriate professional review. [SEC staff statement on tokenized securities](https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities).

## Verification

See Session11 in `FLAGSHIP-LEDGER.md` for commands, actual outcomes, environment limits and existing-work preservation checks. Contract/unit tests exercise fictional data. Browser tests use the existing development-auth fixture and an isolated database. These are not production acceptance or a smart-contract security audit.

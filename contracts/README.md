# Local ERC-3643 contract harness

This workspace is isolated from the web application and from Stripe. The browser sandbox does not invoke it. No private key, RPC endpoint, wallet extension or real USDC is needed. Constructors and factory reject any chain other than local chain 31337, including Base mainnet 8453 and Base Sepolia 84532.

## Run

Install Foundry from its official distribution, then:

```sh
cd contracts
bash install.sh
forge test -vv
```

The installer uses `forge install --no-git` and immutable revisions. Dependencies and compiler outputs are ignored, not vendored into application bundles. It does not alter root npm dependencies or create a commit. The reviewed revisions are also recorded in dependencies.lock.json.

## Design boundary

`RealEstateSecurityToken` extends the real upstream Token implementation. The local factory initializes the token atomically, appoints the caller as agent/owner, leaves transfers paused initially, and binds a listing reference as `keccak256(abi.encode(workspaceId, listingId))`. Database listing IDs are text, not necessarily UUIDs. This hash is an association, not ownership verification. On-chain state is not automatically reconciled into Postgres.

Upstream TokenySolutions/T-REX is deprecated; the pinned source is ERC-3643/ERC-3643 (4.1.3). Its Solidity sources use GPL-3.0; retain upstream notices and review licensing before distributing a derivative. This test extension is GPL-3.0. OpenZeppelin dependencies are the compatible 4.9.6 series and ONCHAINID is 2.2.1.

## Before a live offering

There is deliberately no network deployment script or mainnet mode. A future production integration requires an issuer/SPV and verified issuing rights, reviewed offering terms and jurisdiction rules, an actual KYC/AML/eligibility provider and trusted claim issuer, custody/escrow arrangements, an audited contract suite, key governance, and chain-event reconciliation (including reorgs, confirmation depth and replay protection). The application sandbox proves none of those.

Do not call the browser mock claim an SDAR credential, or show its simulated amounts as a transaction hash or USDC payment.

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# No submodule, root package changes, or automatic commit. All refs immutable.
forge install --root "$(pwd)" --no-git erc3643=ERC-3643/ERC-3643@2f0704dee9658ad9cd5b6ed82e7427da74c28345
forge install --root "$(pwd)" --no-git openzeppelin-contracts=OpenZeppelin/openzeppelin-contracts@dc44c9f1a4c3b10af99492eed84f83ed244203f6
forge install --root "$(pwd)" --no-git openzeppelin-contracts-upgradeable=OpenZeppelin/openzeppelin-contracts-upgradeable@09b36d5e94e1270521a223db2b01a4f02de0e5bf
forge install --root "$(pwd)" --no-git onchain-id=onchain-id/solidity@a483cda6821e3883497972d36d0c4c1e1693e483

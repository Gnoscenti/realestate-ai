// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Token} from "erc3643/token/Token.sol";

/// @notice LOCAL HARNESS ONLY. A listing reference conveys no title or security rights.
/// @dev The immutable reference hashes ABI-encoded workspace and listing TEXT IDs.
///      Construction on Base mainnet or Base Sepolia is deliberately refused.
///      Initialize atomically with LocalTokenFactory to prevent initialization takeover.
contract RealEstateSecurityToken is Token {
    bytes32 public immutable listingReference;

    constructor(bytes32 reference_) {
        require(block.chainid == 31337, "local simulation only");
        require(reference_ != bytes32(0), "empty listing reference");
        listingReference = reference_;
    }
}

/// @notice Creates and initializes a local ERC-3643 instance in one transaction.
contract LocalTokenFactory {
    event LocalTokenCreated(bytes32 indexed listingReference, address indexed token, address indexed operator);
    mapping(bytes32 => address) public tokens;

    function create(
        string calldata workspaceId,
        string calldata listingId,
        address registry,
        address compliance
    ) external returns (RealEstateSecurityToken token) {
        require(block.chainid == 31337, "local simulation only");
        require(bytes(workspaceId).length > 0 && bytes(listingId).length > 0, "missing reference");
        require(registry.code.length > 0 && compliance.code.length > 0, "contracts required");
        // Include operator so another caller cannot squat a workspace/listing pair.
        bytes32 reference_ = keccak256(abi.encode(workspaceId, listingId));
        bytes32 key = keccak256(abi.encode(msg.sender, reference_));
        require(tokens[key] == address(0), "already created");
        token = new RealEstateSecurityToken(reference_);
        token.init(registry, compliance, "LOCAL PROPERTY SIMULATION", "SIM", 6, address(0));
        token.addAgent(msg.sender);
        token.transferOwnership(msg.sender);
        tokens[key] = address(token);
        emit LocalTokenCreated(reference_, address(token), msg.sender);
    }
}

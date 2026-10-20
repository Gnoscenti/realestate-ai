// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {RealEstateSecurityToken, LocalTokenFactory} from "../src/RealEstateSecurityToken.sol";
import {IdentityRegistry} from "erc3643/registry/implementation/IdentityRegistry.sol";
import {IdentityRegistryStorage} from "erc3643/registry/implementation/IdentityRegistryStorage.sol";
import {ClaimTopicsRegistry} from "erc3643/registry/implementation/ClaimTopicsRegistry.sol";
import {TrustedIssuersRegistry} from "erc3643/registry/implementation/TrustedIssuersRegistry.sol";
import {DefaultCompliance} from "erc3643/compliance/legacy/DefaultCompliance.sol";
import {Identity} from "@onchain-id/solidity/contracts/Identity.sol";
import {ClaimIssuer} from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import {IIdentity} from "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";

interface Vm {
    function chainId(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

/// Real upstream identity/issuer/registry/token contracts in the local EVM.
/// The signing key below is a public test constant, never a deployment key.
contract RealEstateSecurityTokenTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant TEST_SIGNER = 0xA11CE;
    uint256 private constant TOPIC = 1;
    address private constant INVESTOR = address(0xB0B);
    address private constant RECIPIENT = address(0xCAFE);
    IdentityRegistry private registry;
    ClaimIssuer private issuer;
    DefaultCompliance private policy;
    LocalTokenFactory private factory;
    RealEstateSecurityToken private token;

    function setUp() public {
        vm.chainId(31337);
        ClaimTopicsRegistry topics = new ClaimTopicsRegistry();
        topics.init();
        topics.addClaimTopic(TOPIC);
        TrustedIssuersRegistry issuers = new TrustedIssuersRegistry();
        issuers.init();
        issuer = new ClaimIssuer(address(this));
        issuer.addKey(keccak256(abi.encode(vm.addr(TEST_SIGNER))), 3, 1);
        uint256[] memory requiredTopics = new uint256[](1);
        requiredTopics[0] = TOPIC;
        issuers.addTrustedIssuer(IClaimIssuer(address(issuer)), requiredTopics);
        IdentityRegistryStorage store = new IdentityRegistryStorage();
        store.init();
        registry = new IdentityRegistry();
        registry.init(address(issuers), address(topics), address(store));
        store.bindIdentityRegistry(address(registry));
        registry.addAgent(address(this));
        policy = new DefaultCompliance(); // permissive fixture; NOT a jurisdiction policy
        factory = new LocalTokenFactory();
        token = factory.create("workspace:test", "listing:text-id", address(registry), address(policy));
    }

    function addSignedIdentity(address wallet) private returns (bytes memory signature) {
        Identity identity = new Identity(address(this), false);
        bytes memory data = bytes("fictional local test only");
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(address(identity), TOPIC, data))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEST_SIGNER, digest);
        signature = abi.encodePacked(r, s, v);
        identity.addClaim(TOPIC, 1, address(issuer), signature, data, "");
        registry.registerIdentity(wallet, IIdentity(address(identity)), 840);
    }

    function testAtomicInitializationAndListingBinding() public {
        require(token.owner() == address(this), "operator ownership");
        require(token.isAgent(address(this)), "operator agent");
        require(token.paused(), "starts paused");
        require(token.listingReference() == keccak256(abi.encode("workspace:test", "listing:text-id")), "reference");
        vm.expectRevert();
        token.init(address(registry), address(policy), "takeover", "BAD", 6, address(0));
        vm.expectRevert(bytes("already created"));
        factory.create("workspace:test", "listing:text-id", address(registry), address(policy));
    }

    function testSignedClaimUnlocksMintAndVerifiedTransfer() public {
        vm.expectRevert();
        token.mint(INVESTOR, 10_000_000);
        addSignedIdentity(INVESTOR);
        require(registry.isVerified(INVESTOR), "signed claim not verified");
        token.mint(INVESTOR, 10_000_000);
        token.unpause();
        vm.prank(INVESTOR);
        vm.expectRevert();
        token.transfer(RECIPIENT, 1_000_000);
        addSignedIdentity(RECIPIENT);
        vm.prank(INVESTOR);
        token.transfer(RECIPIENT, 1_000_000);
        require(token.balanceOf(INVESTOR) == 9_000_000, "sender balance");
        require(token.balanceOf(RECIPIENT) == 1_000_000, "recipient balance");
    }

    function testRevokedSignedClaimBlocksMint() public {
        bytes memory signature = addSignedIdentity(INVESTOR);
        issuer.revokeClaimBySignature(signature);
        require(!registry.isVerified(INVESTOR), "revoked claim accepted");
        vm.expectRevert();
        token.mint(INVESTOR, 1_000_000);
    }

    function testPauseFreezeAndUnauthorizedMint() public {
        addSignedIdentity(INVESTOR);
        addSignedIdentity(RECIPIENT);
        token.mint(INVESTOR, 10_000_000);
        vm.prank(RECIPIENT);
        vm.expectRevert();
        token.mint(RECIPIENT, 1);
        vm.prank(INVESTOR);
        vm.expectRevert();
        token.transfer(RECIPIENT, 1);
        token.unpause();
        token.setAddressFrozen(INVESTOR, true);
        vm.prank(INVESTOR);
        vm.expectRevert();
        token.transfer(RECIPIENT, 1);
    }

    function testRejectsBaseMainnetAndSepolia() public {
        vm.chainId(8453);
        vm.expectRevert(bytes("local simulation only"));
        factory.create("workspace:test", "other", address(registry), address(policy));
        vm.expectRevert(bytes("local simulation only"));
        new RealEstateSecurityToken(bytes32(uint256(1)));
        vm.chainId(84532);
        vm.expectRevert(bytes("local simulation only"));
        new RealEstateSecurityToken(bytes32(uint256(1)));
    }
}

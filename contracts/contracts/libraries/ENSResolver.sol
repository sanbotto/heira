// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IENSRegistry.sol";
import "../interfaces/IENSResolver.sol";

/**
 * @title ENSResolver
 * @notice Library for resolving ENS names to addresses on-chain
 * @dev ENS Registry address: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
 *      Works on Ethereum mainnet (chainId 1), Sepolia testnet (chainId 11155111),
 *      Base mainnet (chainId 8453), and Base Sepolia (chainId 84532)
 */
library ENSResolver {
    // ENS Registry address (consistent across all supported networks)
    address constant ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;

    /**
     * @notice Compute the namehash of an ENS name
     * @param name The ENS name (e.g., "vitalik.eth")
     * @return The namehash of the ENS name
     * @dev Implements the ENS namehash algorithm: namehash('') = 0, namehash(name) = keccak256(namehash(parent) + keccak256(label))
     *      Labels are processed from right to left (TLD first)
     */
    function namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = 0x0000000000000000000000000000000000000000000000000000000000000000;

        if (bytes(name).length == 0) {
            return node;
        }

        bytes memory nameBytes = bytes(name);
        uint256 len = nameBytes.length;

        // Find all dot positions
        uint256[] memory dots = new uint256[](20); // Support up to 20 labels
        uint256 dotCount = 0;
        dots[dotCount++] = len; // Add end position

        for (uint256 i = 0; i < len; i++) {
            if (nameBytes[i] == 0x2e) {
                // '.'
                dots[dotCount++] = i;
            }
        }

        // Process labels from right to left (reverse order)
        for (uint256 d = dotCount; d > 0; d--) {
            uint256 labelStart = d == dotCount ? 0 : dots[d - 1] + 1;
            uint256 labelEnd = dots[d - 1];

            if (labelEnd > labelStart) {
                uint256 labelLen = labelEnd - labelStart;
                bytes memory label = new bytes(labelLen);
                for (uint256 i = 0; i < labelLen; i++) {
                    label[i] = nameBytes[labelStart + i];
                }
                node = keccak256(abi.encodePacked(node, keccak256(label)));
            }
        }

        return node;
    }

    /**
     * @notice Resolve an ENS name to an Ethereum address
     * @param name The ENS name to resolve (e.g., "vitalik.eth")
     * @return The resolved Ethereum address, or address(0) if resolution fails
     * @dev Works on Ethereum mainnet (chainId 1), Sepolia testnet (chainId 11155111),
     *      Base mainnet (chainId 8453), and Base Sepolia (chainId 84532)
     */
    function resolve(string memory name) internal view returns (address) {
        // Only resolve on chains that have ENS deployed
        // Mainnet: chainId 1, Sepolia: chainId 11155111
        // Base: chainId 8453, Base Sepolia: chainId 84532
        if (
            block.chainid != 1 &&
            block.chainid != 11155111 &&
            block.chainid != 8453 &&
            block.chainid != 84532
        ) {
            return address(0);
        }

        bytes32 node = namehash(name);

        IENSRegistry registry = IENSRegistry(ENS_REGISTRY);
        address resolverAddress = registry.resolver(node);

        if (resolverAddress == address(0)) {
            return address(0);
        }

        IENSResolver resolver = IENSResolver(resolverAddress);
        return resolver.addr(node);
    }

    /**
     * @notice Check if a string is a valid ENS name format
     * @param name The string to check
     * @return True if it looks like an ENS name (contains .eth)
     */
    function isENSName(string memory name) internal pure returns (bool) {
        bytes memory nameBytes = bytes(name);
        if (nameBytes.length == 0) {
            return false;
        }

        // Check if it ends with .eth
        uint256 len = nameBytes.length;
        if (len < 4) {
            return false;
        }

        // Check for .eth suffix
        return
            nameBytes[len - 4] == 0x2e && // '.'
            nameBytes[len - 3] == 0x65 && // 'e'
            nameBytes[len - 2] == 0x74 && // 't'
            nameBytes[len - 1] == 0x68; // 'h'
    }
}

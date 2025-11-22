// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IENSRegistry
 * @notice Interface for ENS Registry contract
 */
interface IENSRegistry {
    function resolver(bytes32 node) external view returns (address);
}

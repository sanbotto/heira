// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IENSResolver
 * @notice Interface for ENS Resolver contract
 */
interface IENSResolver {
    function addr(bytes32 node) external view returns (address);
}

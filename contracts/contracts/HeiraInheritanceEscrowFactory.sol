// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./HeiraInheritanceEscrow.sol";

/**
 * @title HeiraInheritanceEscrowFactory
 * @notice Factory contract for deploying HeiraInheritanceEscrow instances
 * @dev Allows users to create their own escrow contracts
 */
contract HeiraInheritanceEscrowFactory {
    // Array of all deployed escrow contracts
    address[] public escrows;

    // Mapping from owner to their escrow contracts
    mapping(address => address[]) public ownerEscrows;

    // Mapping to check if an address is a valid escrow
    mapping(address => bool) public isEscrow;

    // Events
    event EscrowCreated(
        address indexed escrow,
        address indexed owner,
        address indexed mainWallet,
        uint256 inactivityPeriod
    );

    /**
     * @notice Create a new HeiraInheritanceEscrow contract
     * @param _mainWallet The wallet address to monitor for activity
     * @param _inactivityPeriod Period of inactivity in seconds before execution
     * @return escrowAddress Address of the newly created escrow contract
     */
    function createEscrow(
        address _mainWallet,
        uint256 _inactivityPeriod
    ) external returns (address escrowAddress) {
        HeiraInheritanceEscrow escrow = new HeiraInheritanceEscrow(
            _mainWallet,
            _inactivityPeriod,
            msg.sender
        );

        escrowAddress = address(escrow);
        escrows.push(escrowAddress);
        ownerEscrows[msg.sender].push(escrowAddress);
        isEscrow[escrowAddress] = true;

        emit EscrowCreated(escrowAddress, msg.sender, _mainWallet, _inactivityPeriod);

        return escrowAddress;
    }

    /**
     * @notice Get the total number of escrows created
     * @return Total count of escrow contracts
     */
    function getEscrowCount() external view returns (uint256) {
        return escrows.length;
    }

    /**
     * @notice Get all escrow addresses
     * @return Array of all escrow contract addresses
     */
    function getAllEscrows() external view returns (address[] memory) {
        return escrows;
    }

    /**
     * @notice Get all escrows owned by a specific address
     * @param _owner Owner address
     * @return Array of escrow contract addresses owned by the owner
     */
    function getEscrowsByOwner(address _owner) external view returns (address[] memory) {
        return ownerEscrows[_owner];
    }
}

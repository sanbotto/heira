// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./InheritanceEscrow.sol";
import "./libraries/ENSResolver.sol";

/**
 * @title InheritanceEscrowFactory
 * @notice Factory contract for deploying InheritanceEscrow instances
 * @dev Allows users to create their own escrow contracts
 */
contract InheritanceEscrowFactory {
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
     * @notice Create a new InheritanceEscrow contract
     * @param _mainWallet The wallet address to monitor for activity
     * @param _inactivityPeriod Period of inactivity in seconds before execution
     * @return escrowAddress Address of the newly created escrow contract
     */
    function createEscrow(
        address _mainWallet,
        uint256 _inactivityPeriod
    ) external returns (address escrowAddress) {
        InheritanceEscrow escrow = new InheritanceEscrow(
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
     * @notice Create a new InheritanceEscrow contract (supports ENS names)
     * @param _mainWallet ENS name (e.g., "vitalik.eth") or address as hex string
     * @param _inactivityPeriod Period of inactivity in seconds before execution
     * @return escrowAddress Address of the newly created escrow contract
     */
    function createEscrowENS(
        string memory _mainWallet,
        uint256 _inactivityPeriod
    ) external returns (address escrowAddress) {
        address mainWalletAddress;

        // Check if it's an ENS name
        if (ENSResolver.isENSName(_mainWallet)) {
            mainWalletAddress = ENSResolver.resolve(_mainWallet);
            require(
                mainWalletAddress != address(0),
                "ENS name resolution failed."
            );
        } else {
            // Try to parse as address (hex string)
            mainWalletAddress = _parseAddress(_mainWallet);
            require(mainWalletAddress != address(0), "Invalid address format");
        }

        InheritanceEscrow escrow = new InheritanceEscrow(
            mainWalletAddress,
            _inactivityPeriod,
            msg.sender
        );

        escrowAddress = address(escrow);
        escrows.push(escrowAddress);
        ownerEscrows[msg.sender].push(escrowAddress);
        isEscrow[escrowAddress] = true;

        emit EscrowCreated(escrowAddress, msg.sender, mainWalletAddress, _inactivityPeriod);

        return escrowAddress;
    }

    /**
     * @notice Parse a hex string to an address
     * @param _addressString Hex string representation of address
     * @return Parsed address
     */
    function _parseAddress(string memory _addressString) internal pure returns (address) {
        bytes memory addressBytes = bytes(_addressString);

        // Check if it starts with "0x" and has correct length (42 chars: 0x + 40 hex)
        if (addressBytes.length != 42) {
            return address(0);
        }

        if (addressBytes[0] != 0x30 || addressBytes[1] != 0x78) {
            // "0x"
            return address(0);
        }

        // Parse hex string to address
        uint160 result = 0;
        for (uint256 i = 2; i < 42; i++) {
            uint8 char = uint8(addressBytes[i]);
            uint8 value;

            if (char >= 0x30 && char <= 0x39) {
                // '0'-'9'
                value = char - 0x30;
            } else if (char >= 0x41 && char <= 0x46) {
                // 'A'-'F'
                value = char - 0x37;
            } else if (char >= 0x61 && char <= 0x66) {
                // 'a'-'f'
                value = char - 0x57;
            } else {
                return address(0);
            }

            result = result * 16 + value;
        }

        return address(result);
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

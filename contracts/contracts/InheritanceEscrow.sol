// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ICoinbaseTrade.sol";
import "./libraries/ENSResolver.sol";

/**
 * @title InheritanceEscrow
 * @notice Smart contract for managing inheritance escrow with time-based activation
 * @dev When the owner's wallet has no transactions for the configured period,
 *      the contract can execute transfers to designated beneficiaries
 */
contract InheritanceEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Active,
        Inactive
    }

    struct Beneficiary {
        address recipient;
        uint256 percentage; // Basis points (10000 = 100%)
        uint256 chainId; // Chain ID where recipient should receive funds
    }

    struct TokenConfig {
        address tokenAddress;
        uint256 chainId;
        bool shouldSwap;
        address targetToken; // Token to swap to (if shouldSwap is true)
    }

    // Configuration
    address public immutable mainWallet; // The wallet to monitor for activity
    uint256 public inactivityPeriod; // Time period in seconds (e.g., 3 months)
    uint256 public lastActivityTimestamp; // Last known activity timestamp
    Status public status; // Contract status (Active/Inactive)

    // Beneficiaries
    Beneficiary[] public beneficiaries;
    uint256 public constant BASIS_POINTS = 10000;

    // Token configurations
    TokenConfig[] public tokenConfigs;

    // Coinbase Trade integration
    ICoinbaseTrade public coinbaseTrade;

    // Events
    event EscrowCreated(
        address indexed owner,
        address indexed mainWallet,
        uint256 inactivityPeriod
    );
    event BeneficiaryAdded(address indexed recipient, uint256 percentage, uint256 chainId);
    event TokenConfigAdded(
        address indexed token,
        uint256 chainId,
        bool shouldSwap,
        address targetToken
    );
    event ActivityUpdated(uint256 newTimestamp);
    event StatusChanged(Status newStatus);
    event ExecutionTriggered(address indexed executor);
    event FundsTransferred(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        uint256 chainId
    );
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /**
     * @notice Constructor
     * @param _mainWallet The wallet address to monitor for activity
     * @param _inactivityPeriod Period of inactivity in seconds before execution
     * @param _owner The owner of the escrow contract
     */
    constructor(address _mainWallet, uint256 _inactivityPeriod, address _owner) Ownable(_owner) {
        require(_mainWallet != address(0), "Invalid main wallet");
        require(_inactivityPeriod > 0, "Invalid inactivity period");
        require(_owner != address(0), "Invalid owner");

        mainWallet = _mainWallet;
        inactivityPeriod = _inactivityPeriod;
        lastActivityTimestamp = block.timestamp;
        status = Status.Active;

        emit EscrowCreated(_owner, _mainWallet, _inactivityPeriod);
    }

    /**
     * @notice Set the Coinbase Trade contract address
     * @param _coinbaseTrade Address of the Coinbase Trade contract
     */
    function setCoinbaseTrade(address _coinbaseTrade) external onlyOwner {
        require(_coinbaseTrade != address(0), "Invalid address");
        coinbaseTrade = ICoinbaseTrade(_coinbaseTrade);
    }

    /**
     * @notice Add a beneficiary with distribution percentage
     * @param _recipient Address to receive funds
     * @param _percentage Distribution percentage in basis points
     * @param _chainId Chain ID where recipient should receive funds
     */
    function addBeneficiary(
        address _recipient,
        uint256 _percentage,
        uint256 _chainId
    ) external onlyOwner {
        require(_recipient != address(0), "Invalid recipient");
        require(_percentage > 0 && _percentage <= BASIS_POINTS, "Invalid percentage");
        require(status == Status.Active, "Contract is inactive");

        beneficiaries.push(
            Beneficiary({recipient: _recipient, percentage: _percentage, chainId: _chainId})
        );

        emit BeneficiaryAdded(_recipient, _percentage, _chainId);
    }

    /**
     * @notice Add a beneficiary with distribution percentage (supports ENS names)
     * @param _recipient ENS name (e.g., "vitalik.eth") or address as hex string
     * @param _percentage Distribution percentage in basis points
     * @param _chainId Chain ID where recipient should receive funds
     */
    function addBeneficiaryENS(
        string memory _recipient,
        uint256 _percentage,
        uint256 _chainId
    ) external onlyOwner {
        require(_percentage > 0 && _percentage <= BASIS_POINTS, "Invalid percentage");
        require(status == Status.Active, "Contract is inactive");

        address recipientAddress;

        // Check if it's an ENS name
        if (ENSResolver.isENSName(_recipient)) {
            recipientAddress = ENSResolver.resolve(_recipient);
            require(
                recipientAddress != address(0),
                "ENS name resolution failed."
            );
        } else {
            // Try to parse as address (hex string)
            recipientAddress = _parseAddress(_recipient);
            require(recipientAddress != address(0), "Invalid address format");
        }

        beneficiaries.push(
            Beneficiary({recipient: recipientAddress, percentage: _percentage, chainId: _chainId})
        );

        emit BeneficiaryAdded(recipientAddress, _percentage, _chainId);
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
     * @notice Add token configuration for monitoring and swapping
     * @param _tokenAddress Token contract address
     * @param _chainId Chain ID where token exists
     * @param _shouldSwap Whether to swap this token to target token
     * @param _targetToken Target token address (if shouldSwap is true)
     */
    function addTokenConfig(
        address _tokenAddress,
        uint256 _chainId,
        bool _shouldSwap,
        address _targetToken
    ) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        require(status == Status.Active, "Contract is inactive");

        if (_shouldSwap) {
            require(_targetToken != address(0), "Invalid target token");
        }

        tokenConfigs.push(
            TokenConfig({
                tokenAddress: _tokenAddress,
                chainId: _chainId,
                shouldSwap: _shouldSwap,
                targetToken: _targetToken
            })
        );

        emit TokenConfigAdded(_tokenAddress, _chainId, _shouldSwap, _targetToken);
    }

    /**
     * @notice Batch add multiple beneficiaries
     * @param _recipients Array of recipient addresses
     * @param _percentages Array of distribution percentages in basis points
     * @param _chainIds Array of chain IDs where recipients should receive funds
     */
    function addBeneficiariesBatch(
        address[] calldata _recipients,
        uint256[] calldata _percentages,
        uint256[] calldata _chainIds
    ) external onlyOwner {
        require(
            _recipients.length == _percentages.length && _recipients.length == _chainIds.length,
            "Array length mismatch"
        );
        require(status == Status.Active, "Contract is inactive");

        for (uint256 i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            require(_percentages[i] > 0 && _percentages[i] <= BASIS_POINTS, "Invalid percentage");

            beneficiaries.push(
                Beneficiary({
                    recipient: _recipients[i],
                    percentage: _percentages[i],
                    chainId: _chainIds[i]
                })
            );

            emit BeneficiaryAdded(_recipients[i], _percentages[i], _chainIds[i]);
        }
    }

    /**
     * @notice Batch add multiple token configurations
     * @param _tokenAddresses Array of token contract addresses
     * @param _chainIds Array of chain IDs where tokens exist
     * @param _shouldSwaps Array indicating whether to swap each token
     * @param _targetTokens Array of target token addresses (if shouldSwap is true)
     */
    function addTokenConfigsBatch(
        address[] calldata _tokenAddresses,
        uint256[] calldata _chainIds,
        bool[] calldata _shouldSwaps,
        address[] calldata _targetTokens
    ) external onlyOwner {
        require(
            _tokenAddresses.length == _chainIds.length &&
                _tokenAddresses.length == _shouldSwaps.length &&
                _tokenAddresses.length == _targetTokens.length,
            "Array length mismatch"
        );
        require(status == Status.Active, "Contract is inactive");

        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            require(_tokenAddresses[i] != address(0), "Invalid token address");

            if (_shouldSwaps[i]) {
                require(_targetTokens[i] != address(0), "Invalid target token");
            }

            tokenConfigs.push(
                TokenConfig({
                    tokenAddress: _tokenAddresses[i],
                    chainId: _chainIds[i],
                    shouldSwap: _shouldSwaps[i],
                    targetToken: _targetTokens[i]
                })
            );

            emit TokenConfigAdded(
                _tokenAddresses[i],
                _chainIds[i],
                _shouldSwaps[i],
                _targetTokens[i]
            );
        }
    }

    /**
     * @notice Update the last activity timestamp (called by keeper or oracle)
     * @param _timestamp New activity timestamp
     */
    function updateActivity(uint256 _timestamp) external {
        require(_timestamp >= lastActivityTimestamp, "Timestamp must be newer");
        require(_timestamp <= block.timestamp, "Timestamp cannot be in future");

        lastActivityTimestamp = _timestamp;
        emit ActivityUpdated(_timestamp);
    }

    /**
     * @notice Deactivate the escrow contract
     * @dev Only owner can deactivate
     */
    function deactivate() external onlyOwner {
        require(status == Status.Active, "Already inactive");
        status = Status.Inactive;
        emit StatusChanged(Status.Inactive);
    }

    /**
     * @notice Get the current status of the contract
     * @return Current status (Active or Inactive)
     */
    function getStatus() external view returns (Status) {
        return status;
    }

    /**
     * @notice Check if execution conditions are met
     * @return True if conditions are met and execution can proceed
     */
    function canExecute() public view returns (bool) {
        if (status != Status.Active) {
            return false;
        }

        uint256 timeSinceActivity = block.timestamp - lastActivityTimestamp;
        return timeSinceActivity >= inactivityPeriod;
    }

    /**
     * @notice Execute the escrow transfer
     * @dev Can be called by anyone when conditions are met
     * @dev This function checks conditions and executes transfers/swaps
     */
    function run() external nonReentrant {
        require(status == Status.Active, "Contract is inactive");
        require(canExecute(), "Execution conditions not met");
        require(beneficiaries.length > 0, "No beneficiaries configured");
        require(tokenConfigs.length > 0, "No tokens configured");

        emit ExecutionTriggered(msg.sender);

        // Process each token configuration
        for (uint256 i = 0; i < tokenConfigs.length; i++) {
            TokenConfig memory config = tokenConfigs[i];

            // Only process tokens on the current chain
            if (config.chainId != block.chainid) {
                continue;
            }

            IERC20 token = IERC20(config.tokenAddress);
            uint256 balance = token.balanceOf(address(this));

            if (balance == 0) {
                continue;
            }

            // Swap token if configured
            if (config.shouldSwap && address(coinbaseTrade) != address(0)) {
                balance = _executeSwap(config, balance);
            }

            // Distribute to beneficiaries
            _distributeToBeneficiaries(config.tokenAddress, balance, config.chainId);
        }
    }

    /**
     * @notice Execute a token swap via Coinbase Trade
     * @param config Token configuration
     * @param amountIn Amount of input token
     * @return amountOut Amount of output token received
     */
    function _executeSwap(
        TokenConfig memory config,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        require(address(coinbaseTrade) != address(0), "Coinbase Trade not set");

        IERC20 tokenIn = IERC20(config.tokenAddress);
        // Use forceApprove from SafeERC20 which handles both setting and resetting approval
        SafeERC20.forceApprove(tokenIn, address(coinbaseTrade), amountIn);

        ICoinbaseTrade.SwapParams memory params = ICoinbaseTrade.SwapParams({
            tokenIn: config.tokenAddress,
            tokenOut: config.targetToken,
            amountIn: amountIn,
            minAmountOut: 0, // Could add slippage protection
            recipient: address(this)
        });

        amountOut = coinbaseTrade.executeSwap(params);

        emit SwapExecuted(config.tokenAddress, config.targetToken, amountIn, amountOut);

        return amountOut;
    }

    /**
     * @notice Distribute funds to beneficiaries according to percentages
     * @param tokenAddress Token to distribute
     * @param totalAmount Total amount to distribute
     * @param chainId Chain ID for distribution
     */
    function _distributeToBeneficiaries(
        address tokenAddress,
        uint256 totalAmount,
        uint256 chainId
    ) internal {
        IERC20 token = IERC20(tokenAddress);
        uint256 distributed = 0;

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            Beneficiary memory beneficiary = beneficiaries[i];

            // Only distribute to beneficiaries on the same chain
            if (beneficiary.chainId != chainId) {
                continue;
            }

            uint256 amount = (totalAmount * beneficiary.percentage) / BASIS_POINTS;

            if (amount > 0) {
                token.safeTransfer(beneficiary.recipient, amount);
                distributed += amount;

                emit FundsTransferred(tokenAddress, beneficiary.recipient, amount, chainId);
            }
        }

        // Handle any remainder due to rounding
        uint256 remainder = totalAmount - distributed;
        if (remainder > 0 && beneficiaries.length > 0) {
            // Send remainder to first beneficiary
            token.safeTransfer(beneficiaries[0].recipient, remainder);
            emit FundsTransferred(tokenAddress, beneficiaries[0].recipient, remainder, chainId);
        }
    }

    /**
     * @notice Get all beneficiaries
     * @return Array of beneficiary structs
     */
    function getBeneficiaries() external view returns (Beneficiary[] memory) {
        return beneficiaries;
    }

    /**
     * @notice Get all token configurations
     * @return Array of token config structs
     */
    function getTokenConfigs() external view returns (TokenConfig[] memory) {
        return tokenConfigs;
    }

    /**
     * @notice Get time until execution can occur
     * @return Seconds until execution is possible (0 if ready)
     */
    function getTimeUntilExecution() external view returns (uint256) {
        if (status != Status.Active) {
            return type(uint256).max;
        }

        uint256 timeSinceActivity = block.timestamp - lastActivityTimestamp;
        if (timeSinceActivity >= inactivityPeriod) {
            return 0;
        }

        return inactivityPeriod - timeSinceActivity;
    }
}

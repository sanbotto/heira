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
        address tokenAddress; // Token to receive (zero address for native ETH)
        bool shouldSwap; // Whether to swap before sending
        address targetToken; // Target token if swapping (zero address if not swapping)
    }

    // Configuration
    address public immutable mainWallet; // The wallet to monitor for activity
    uint256 public inactivityPeriod; // Time period in seconds (e.g., 3 months)
    uint256 public lastActivityTimestamp; // Last known activity timestamp
    Status public status; // Contract status (Active/Inactive)
    address public keeper; // Authorized keeper address for updating activity

    // Beneficiaries
    Beneficiary[] public beneficiaries;
    uint256 public constant BASIS_POINTS = 1e4;
    uint256 public constant MAX_BENEFICIARIES = 5;

    // Chain IDs
    uint256 private constant CITREA_TESTNET_CHAIN_ID = 5115;

    // ASCII character constants for hex parsing
    uint8 private constant ASCII_ZERO_OFFSET = 0x30;
    uint8 private constant ASCII_X_LOWERCASE = 0x78;

    // Coinbase Trade integration
    ICoinbaseTrade public coinbaseTrade;

    // Events
    event EscrowCreated(
        address indexed owner,
        address indexed mainWallet,
        uint256 inactivityPeriod
    );
    event BeneficiaryAdded(
        address indexed recipient,
        uint256 percentage,
        uint256 chainId,
        address tokenAddress,
        bool shouldSwap,
        address targetToken
    );
    event ActivityUpdated(uint256 newTimestamp);
    event StatusChanged(Status newStatus);
    event KeeperUpdated(address indexed newKeeper);
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
     * @dev Sets keeper to the authorized keeper service address
     */
    constructor(address _mainWallet, uint256 _inactivityPeriod, address _owner) Ownable(_owner) {
        require(_mainWallet != address(0), "Invalid main wallet");
        require(_inactivityPeriod > 0, "Invalid inactivity period");
        require(_owner != address(0), "Invalid owner");

        mainWallet = _mainWallet;
        inactivityPeriod = _inactivityPeriod;
        lastActivityTimestamp = block.timestamp;
        status = Status.Active;
        keeper = 0xC9e465e5346773c3Cb69e167B5733306FE7db75f; // Authorized keeper service address

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
     * @notice Set the keeper address authorized to update activity
     * @param _keeper Address of the authorized keeper (zero address to remove keeper)
     */
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /**
     * @notice Add a beneficiary with distribution percentage and token swap config
     * @param _recipient Address to receive funds
     * @param _percentage Distribution percentage in basis points
     * @param _chainId Chain ID where recipient should receive funds
     * @param _tokenAddress Token to receive (zero address for native ETH)
     * @param _shouldSwap Whether to swap before sending
     * @param _targetToken Target token if swapping (zero address if not swapping)
     */
    function addBeneficiary(
        address _recipient,
        uint256 _percentage,
        uint256 _chainId,
        address _tokenAddress,
        bool _shouldSwap,
        address _targetToken
    ) external onlyOwner {
        require(_recipient != address(0), "Invalid recipient");
        require(_percentage > 0 && _percentage <= BASIS_POINTS, "Invalid percentage");
        require(status == Status.Active, "Contract is inactive");
        require(beneficiaries.length < MAX_BENEFICIARIES, "Maximum beneficiaries reached");

        if (_shouldSwap) {
            require(_targetToken != address(0), "Invalid target token");
        }

        beneficiaries.push(
            Beneficiary({
                recipient: _recipient,
                percentage: _percentage,
                chainId: _chainId,
                tokenAddress: _tokenAddress,
                shouldSwap: _shouldSwap,
                targetToken: _targetToken
            })
        );

        emit BeneficiaryAdded(
            _recipient,
            _percentage,
            _chainId,
            _tokenAddress,
            _shouldSwap,
            _targetToken
        );
    }

    /**
     * @notice Add a beneficiary with distribution percentage (supports ENS names)
     * @param _recipient ENS name (e.g., "vitalik.eth") or address as hex string
     * @param _percentage Distribution percentage in basis points
     * @param _chainId Chain ID where recipient should receive funds
     * @param _tokenAddress Token to receive (zero address for native ETH)
     * @param _shouldSwap Whether to swap before sending
     * @param _targetToken Target token if swapping (zero address if not swapping)
     */
    function addBeneficiaryENS(
        string memory _recipient,
        uint256 _percentage,
        uint256 _chainId,
        address _tokenAddress,
        bool _shouldSwap,
        address _targetToken
    ) external onlyOwner {
        require(_percentage > 0 && _percentage <= BASIS_POINTS, "Invalid percentage");
        require(status == Status.Active, "Contract is inactive");
        require(beneficiaries.length < MAX_BENEFICIARIES, "Maximum beneficiaries reached");

        if (_shouldSwap) {
            require(_targetToken != address(0), "Invalid target token");
        }

        address recipientAddress;

        // Check if it's an ENS name
        if (ENSResolver.isENSName(_recipient)) {
            recipientAddress = ENSResolver.resolve(_recipient);
            require(recipientAddress != address(0), "ENS name resolution failed.");
        } else {
            // Try to parse as address (hex string)
            recipientAddress = _parseAddress(_recipient);
            require(recipientAddress != address(0), "Invalid address format");
        }

        beneficiaries.push(
            Beneficiary({
                recipient: recipientAddress,
                percentage: _percentage,
                chainId: _chainId,
                tokenAddress: _tokenAddress,
                shouldSwap: _shouldSwap,
                targetToken: _targetToken
            })
        );

        emit BeneficiaryAdded(
            recipientAddress,
            _percentage,
            _chainId,
            _tokenAddress,
            _shouldSwap,
            _targetToken
        );
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

        if (addressBytes[0] != ASCII_ZERO_OFFSET || addressBytes[1] != ASCII_X_LOWERCASE) {
            // "0x"
            return address(0);
        }

        // Parse hex string to address
        uint160 result = 0;
        for (uint256 i = 2; i < 42; i++) {
            uint8 char = uint8(addressBytes[i]);
            uint8 value;

            if (char >= ASCII_ZERO_OFFSET && char <= 0x39) {
                // '0'-'9'
                value = char - ASCII_ZERO_OFFSET;
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
     * @notice Batch add multiple beneficiaries with token swap configs
     * @param _recipients Array of recipient addresses
     * @param _percentages Array of distribution percentages in basis points
     * @param _chainIds Array of chain IDs where recipients should receive funds
     * @param _tokenAddresses Array of token addresses (zero address for native ETH)
     * @param _shouldSwaps Array indicating whether to swap each token
     * @param _targetTokens Array of target token addresses (if shouldSwap is true)
     */
    function addBeneficiariesBatch(
        address[] calldata _recipients,
        uint256[] calldata _percentages,
        uint256[] calldata _chainIds,
        address[] calldata _tokenAddresses,
        bool[] calldata _shouldSwaps,
        address[] calldata _targetTokens
    ) external onlyOwner {
        require(
            _recipients.length == _percentages.length &&
                _recipients.length == _chainIds.length &&
                _recipients.length == _tokenAddresses.length &&
                _recipients.length == _shouldSwaps.length &&
                _recipients.length == _targetTokens.length,
            "Array length mismatch"
        );
        require(status == Status.Active, "Contract is inactive");
        require(
            beneficiaries.length + _recipients.length <= MAX_BENEFICIARIES,
            "Maximum beneficiaries exceeded"
        );

        for (uint256 i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            require(_percentages[i] > 0 && _percentages[i] <= BASIS_POINTS, "Invalid percentage");

            if (_shouldSwaps[i]) {
                require(_targetTokens[i] != address(0), "Invalid target token");
            }

            beneficiaries.push(
                Beneficiary({
                    recipient: _recipients[i],
                    percentage: _percentages[i],
                    chainId: _chainIds[i],
                    tokenAddress: _tokenAddresses[i],
                    shouldSwap: _shouldSwaps[i],
                    targetToken: _targetTokens[i]
                })
            );

            emit BeneficiaryAdded(
                _recipients[i],
                _percentages[i],
                _chainIds[i],
                _tokenAddresses[i],
                _shouldSwaps[i],
                _targetTokens[i]
            );
        }
    }

    /**
     * @notice Update the last activity timestamp (called by owner or authorized keeper)
     * @param _timestamp New activity timestamp
     * @dev Only owner or authorized keeper can update activity.
     *      Prevents updating if execution is already possible (unless called by owner)
     *      to prevent indefinite postponement of execution.
     */
    function updateActivity(uint256 _timestamp) external {
        require(
            msg.sender == owner() || msg.sender == keeper,
            "Only owner or keeper can update activity"
        );
        require(_timestamp >= lastActivityTimestamp, "Timestamp must be newer");
        require(_timestamp <= block.timestamp, "Timestamp cannot be in future");

        // Prevent keeper from updating if execution is already possible
        // Owner can always update (they own the escrow)
        if (msg.sender != owner()) {
            uint256 timeSinceActivity = block.timestamp - lastActivityTimestamp;
            require(
                timeSinceActivity < inactivityPeriod,
                "Cannot update activity when execution is already possible"
            );
        }

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
     * @notice Get USDC address for current chain
     * @return USDC token address
     */
    function _getUSDCAddress() internal view returns (address) {
        if (block.chainid == 1) {
            // Ethereum Mainnet
            return 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
        } else if (block.chainid == 11155111) {
            // Sepolia
            return 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
        } else if (block.chainid == 8453) {
            // Base Mainnet
            return 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        } else if (block.chainid == 84532) {
            // Base Sepolia
            return 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        }
        return address(0);
    }

    /**
     * @notice Get USDC address for a specific chain ID
     * @param chainId Chain ID to get USDC address for
     * @return USDC token address for the specified chain
     */
    function getUSDCAddressForChain(uint256 chainId) external pure returns (address) {
        if (chainId == 1) {
            // Ethereum Mainnet
            return 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
        } else if (chainId == 11155111) {
            // Sepolia
            return 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
        } else if (chainId == 8453) {
            // Base Mainnet
            return 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        } else if (chainId == 84532) {
            // Base Sepolia
            return 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        }
        return address(0);
    }

    /**
     * @notice Get WCBTC address for current chain
     * @return WCBTC token address
     */
    function _getWCBTCAddress() internal view returns (address) {
        if (block.chainid == 1) {
            // Ethereum Mainnet - WBTC (using WBTC as WCBTC equivalent)
            return 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
        } else if (block.chainid == 11155111) {
            // Sepolia - WBTC (using WBTC as WCBTC equivalent)
            return 0x29F2D40B0605204364c54e5c5C29723839eEF55b;
        } else if (block.chainid == 8453) {
            // Base Mainnet - WBTC (using WBTC as WCBTC equivalent)
            return 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
        } else if (block.chainid == 84532) {
            // Base Sepolia - WBTC (using WBTC as WCBTC equivalent)
            return 0x29F2D40B0605204364c54e5c5C29723839eEF55b;
        } else if (block.chainid == CITREA_TESTNET_CHAIN_ID) {
            // Citrea Testnet
            return 0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93;
        }
        return address(0);
    }

    /**
     * @notice Get WCBTC address for a specific chain ID
     * @param chainId Chain ID to get WCBTC address for
     * @return WCBTC token address for the specified chain
     */
    function getWCBTCAddressForChain(uint256 chainId) external pure returns (address) {
        if (chainId == 1) {
            // Ethereum Mainnet - WBTC (using WBTC as WCBTC equivalent)
            return 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
        } else if (chainId == 11155111) {
            // Sepolia - WBTC (using WBTC as WCBTC equivalent)
            return 0x29F2D40B0605204364c54e5c5C29723839eEF55b;
        } else if (chainId == 8453) {
            // Base Mainnet - WBTC (using WBTC as WCBTC equivalent)
            return 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
        } else if (chainId == 84532) {
            // Base Sepolia - WBTC (using WBTC as WCBTC equivalent)
            return 0x29F2D40B0605204364c54e5c5C29723839eEF55b;
        } else if (chainId == CITREA_TESTNET_CHAIN_ID) {
            // Citrea Testnet
            return 0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93;
        }
        return address(0);
    }

    /**
     * @notice Get WETH address for current chain
     * @return WETH token address
     */
    function _getWETHAddress() internal view returns (address) {
        if (block.chainid == 1) {
            // Ethereum Mainnet
            return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        } else if (block.chainid == 11155111) {
            // Sepolia
            return 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
        } else if (block.chainid == 8453) {
            // Base Mainnet
            return 0x4200000000000000000000000000000000000006;
        } else if (block.chainid == 84532) {
            // Base Sepolia
            return 0x4200000000000000000000000000000000000006;
        } else if (block.chainid == CITREA_TESTNET_CHAIN_ID) {
            // Citrea Testnet - TODO: Replace with actual WETH address when found
            return address(0);
        }
        return address(0);
    }

    /**
     * @notice Get WETH address for a specific chain ID
     * @param chainId Chain ID to get WETH address for
     * @return WETH token address for the specified chain
     */
    function getWETHAddressForChain(uint256 chainId) external pure returns (address) {
        if (chainId == 1) {
            // Ethereum Mainnet
            return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        } else if (chainId == 11155111) {
            // Sepolia
            return 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
        } else if (chainId == 8453) {
            // Base Mainnet
            return 0x4200000000000000000000000000000000000006;
        } else if (chainId == 84532) {
            // Base Sepolia
            return 0x4200000000000000000000000000000000000006;
        } else if (chainId == CITREA_TESTNET_CHAIN_ID) {
            // Citrea Testnet - TODO: Replace with actual WETH address when found
            return address(0);
        }
        return address(0);
    }

    /**
     * @notice Get the chain IDs that should be checked for approvals based on deployment chain
     * @return Array of chain IDs that should be checked
     * @dev Returns both testnet chains (Sepolia and Base Sepolia) if deployed on testnet,
     *      or both mainnet chains (Ethereum Mainnet and Base Mainnet) if deployed on mainnet,
     *      or only Citrea Testnet if deployed on Citrea Testnet
     */
    function getChainsToCheck() external view returns (uint256[] memory) {
        uint256[] memory chains;

        if (block.chainid == 1 || block.chainid == 8453) {
            // Mainnet chains - check both Ethereum Mainnet and Base Mainnet
            chains = new uint256[](2);
            chains[0] = 1; // Ethereum Mainnet
            chains[1] = 8453; // Base Mainnet
        } else if (block.chainid == 11155111 || block.chainid == 84532) {
            // Testnet chains - check both Sepolia and Base Sepolia
            chains = new uint256[](2);
            chains[0] = 11155111; // Sepolia
            chains[1] = 84532; // Base Sepolia
        } else if (block.chainid == CITREA_TESTNET_CHAIN_ID) {
            // Citrea Testnet - only check itself
            chains = new uint256[](1);
            chains[0] = CITREA_TESTNET_CHAIN_ID; // Citrea Testnet
        } else {
            // Unknown chain - return empty array
            chains = new uint256[](0);
        }

        return chains;
    }

    /**
     * @notice Check USDC allowance for mainWallet on current chain
     * @return allowance Current USDC allowance from mainWallet to this contract
     * @return balance Current USDC balance of mainWallet
     * @dev This can only check the current chain where the contract is deployed.
     *      Solidity contracts cannot directly query state from other chains.
     *      For cross-chain approval verification, use off-chain services or the frontend
     *      which calls getChainsToCheck() to determine which chains should be checked
     *      and verifies approvals on each chain separately.
     *
     *      When deployed to:
     *      - Eth Sepolia (11155111) or Base Sepolia (84532): Should check approvals on BOTH Sepolia AND Base Sepolia
     *      - Eth Mainnet (1) or Base Mainnet (8453): Should check approvals on BOTH Mainnet AND Base Mainnet
     *      - Citrea Testnet (5115): Should check approvals only on Citrea Testnet
     */
    function checkUSDCApproval() external view returns (uint256 allowance, uint256 balance) {
        address usdcAddress = _getUSDCAddress();
        if (usdcAddress == address(0)) {
            return (0, 0);
        }

        IERC20 usdcContract = IERC20(usdcAddress);
        allowance = usdcContract.allowance(mainWallet, address(this));
        balance = usdcContract.balanceOf(mainWallet);

        return (allowance, balance);
    }

    /**
     * @notice Check WCBTC allowance for mainWallet on current chain
     * @return allowance Current WCBTC allowance from mainWallet to this contract
     * @return balance Current WCBTC balance of mainWallet
     */
    function checkWCBTCApproval() external view returns (uint256 allowance, uint256 balance) {
        address wcbtcAddress = _getWCBTCAddress();
        if (wcbtcAddress == address(0)) {
            return (0, 0);
        }

        IERC20 wcbtcContract = IERC20(wcbtcAddress);
        allowance = wcbtcContract.allowance(mainWallet, address(this));
        balance = wcbtcContract.balanceOf(mainWallet);

        return (allowance, balance);
    }

    /**
     * @notice Check WETH allowance for mainWallet on current chain
     * @return allowance Current WETH allowance from mainWallet to this contract
     * @return balance Current WETH balance of mainWallet
     */
    function checkWETHApproval() external view returns (uint256 allowance, uint256 balance) {
        address wethAddress = _getWETHAddress();
        if (wethAddress == address(0)) {
            return (0, 0);
        }

        IERC20 wethContract = IERC20(wethAddress);
        allowance = wethContract.allowance(mainWallet, address(this));
        balance = wethContract.balanceOf(mainWallet);

        return (allowance, balance);
    }

    /**
     * @notice Pull tokens from mainWallet using spending cap allowance
     * @param token Token address to pull
     * @param amount Amount to pull
     * @return Amount actually pulled
     */
    function _pullTokensFromMainWallet(address token, uint256 amount) internal returns (uint256) {
        if (token == address(0)) {
            // Native ETH - cannot pull, user must send ETH to escrow
            return 0;
        }

        IERC20 tokenContract = IERC20(token);
        uint256 allowance = tokenContract.allowance(mainWallet, address(this));
        uint256 balance = tokenContract.balanceOf(mainWallet);

        uint256 toPull = amount < allowance ? amount : allowance;
        toPull = toPull < balance ? toPull : balance;

        if (toPull > 0) {
            SafeERC20.safeTransferFrom(tokenContract, mainWallet, address(this), toPull);
        }

        return toPull;
    }

    /**
     * @notice Execute the escrow transfer
     * @dev Can be called by anyone when conditions are met
     * @dev Detects funds in mainWallet, pulls them using spending caps, swaps per-beneficiary, and distributes
     */
    function run() external nonReentrant {
        require(status == Status.Active, "Contract is inactive");
        require(canExecute(), "Execution conditions not met");
        require(beneficiaries.length > 0, "No beneficiaries configured");

        emit ExecutionTriggered(msg.sender);

        // Detect funds: ETH in escrow (user must send ETH to escrow) and tokens in mainWallet
        uint256 ethBalance = address(this).balance;
        address usdcAddress = _getUSDCAddress();
        address wcbtcAddress = _getWCBTCAddress();
        address wethAddress = _getWETHAddress();

        // Pull USDC from mainWallet for beneficiaries who want USDC directly
        if (usdcAddress != address(0)) {
            uint256 usdcBalanceInMainWallet = IERC20(usdcAddress).balanceOf(mainWallet);

            if (usdcBalanceInMainWallet > 0) {
                // Pull full USDC balance from mainWallet (respects allowance limits)
                // Distribution will be handled proportionally by _processTokenForBeneficiaries
                _pullTokensFromMainWallet(usdcAddress, usdcBalanceInMainWallet);
            }
        }

        // Pull WCBTC from mainWallet for beneficiaries who want WCBTC directly
        if (wcbtcAddress != address(0)) {
            uint256 wcbtcBalanceInMainWallet = IERC20(wcbtcAddress).balanceOf(mainWallet);

            if (wcbtcBalanceInMainWallet > 0) {
                // Pull full WCBTC balance from mainWallet (respects allowance limits)
                // Distribution will be handled proportionally by _processTokenForBeneficiaries
                _pullTokensFromMainWallet(wcbtcAddress, wcbtcBalanceInMainWallet);
            }
        }

        // Pull WETH from mainWallet for beneficiaries who want WETH directly
        if (wethAddress != address(0)) {
            uint256 wethBalanceInMainWallet = IERC20(wethAddress).balanceOf(mainWallet);

            if (wethBalanceInMainWallet > 0) {
                // Pull full WETH balance from mainWallet (respects allowance limits)
                // Distribution will be handled proportionally by _processTokenForBeneficiaries
                _pullTokensFromMainWallet(wethAddress, wethBalanceInMainWallet);
            }
        }

        // Process ETH (native token in escrow) - for beneficiaries who want ETH or ETH swapped
        if (ethBalance > 0) {
            _processTokenForBeneficiaries(address(0), ethBalance);
        }

        // Process USDC (now in escrow after pulling) - for beneficiaries who want USDC directly
        if (usdcAddress != address(0)) {
            uint256 usdcInEscrow = IERC20(usdcAddress).balanceOf(address(this));
            if (usdcInEscrow > 0) {
                _processTokenForBeneficiaries(usdcAddress, usdcInEscrow);
            }
        }

        // Process WCBTC (now in escrow after pulling) - for beneficiaries who want WCBTC directly
        if (wcbtcAddress != address(0)) {
            uint256 wcbtcInEscrow = IERC20(wcbtcAddress).balanceOf(address(this));
            if (wcbtcInEscrow > 0) {
                _processTokenForBeneficiaries(wcbtcAddress, wcbtcInEscrow);
            }
        }

        // Process WETH (now in escrow after pulling) - for beneficiaries who want WETH directly
        if (wethAddress != address(0)) {
            uint256 wethInEscrow = IERC20(wethAddress).balanceOf(address(this));
            if (wethInEscrow > 0) {
                _processTokenForBeneficiaries(wethAddress, wethInEscrow);
            }
        }
    }

    /**
     * @notice Process a token for all beneficiaries on current chain
     * @param tokenAddress Token to process (zero address for native ETH)
     * @param totalAmount Total amount available
     */
    function _processTokenForBeneficiaries(address tokenAddress, uint256 totalAmount) internal {
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            Beneficiary memory beneficiary = beneficiaries[i];

            // Only process beneficiaries on the current chain
            if (beneficiary.chainId != block.chainid) {
                continue;
            }

            // Skip if beneficiary doesn't want this token
            if (beneficiary.tokenAddress != tokenAddress) {
                continue;
            }

            // Calculate beneficiary's portion
            uint256 beneficiaryAmount = (totalAmount * beneficiary.percentage) / BASIS_POINTS;

            if (beneficiaryAmount == 0) {
                continue;
            }

            // Swap if beneficiary wants swap
            if (
                beneficiary.shouldSwap &&
                beneficiary.targetToken != address(0) &&
                address(coinbaseTrade) != address(0)
            ) {
                uint256 swappedAmount = _executeSwapForBeneficiary(
                    tokenAddress,
                    beneficiary.targetToken,
                    beneficiaryAmount
                );

                // Distribute swapped tokens
                _distributeToBeneficiary(
                    beneficiary.targetToken,
                    beneficiary.recipient,
                    swappedAmount
                );
            } else {
                // Distribute directly without swap
                _distributeToBeneficiary(tokenAddress, beneficiary.recipient, beneficiaryAmount);
            }
        }
    }

    /**
     * @notice Execute swap for a beneficiary's portion
     * @param tokenIn Input token address (zero address for native ETH)
     * @param tokenOut Output token address
     * @param amountIn Amount to swap
     * @return amountOut Amount received after swap
     */
    function _executeSwapForBeneficiary(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        require(address(coinbaseTrade) != address(0), "Coinbase Trade not set");

        ICoinbaseTrade.SwapParams memory params = ICoinbaseTrade.SwapParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: 0, // Could add slippage protection
            recipient: address(this)
        });

        if (tokenIn == address(0)) {
            // Native ETH swap - send ETH value with the call
            amountOut = coinbaseTrade.executeSwap{value: amountIn}(params);
        } else {
            // ERC20 swap - approve and call
            IERC20 tokenContract = IERC20(tokenIn);
            SafeERC20.forceApprove(tokenContract, address(coinbaseTrade), amountIn);
            amountOut = coinbaseTrade.executeSwap(params);
        }

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);

        return amountOut;
    }

    /**
     * @notice Distribute tokens to a single beneficiary
     * @param tokenAddress Token to distribute (zero address for native ETH)
     * @param recipient Beneficiary address
     * @param amount Amount to distribute
     * @dev Uses call() for ETH distributions to forward all available gas,
     *      preventing failures with contracts that require more than 2300 gas
     */
    function _distributeToBeneficiary(
        address tokenAddress,
        address recipient,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }

        if (tokenAddress == address(0)) {
            // Native ETH distribution using call() to forward all available gas
            // This prevents failures with contracts that need more than 2300 gas
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 distribution
            IERC20 token = IERC20(tokenAddress);
            SafeERC20.safeTransfer(token, recipient, amount);
        }

        emit FundsTransferred(tokenAddress, recipient, amount, block.chainid);
    }

    /**
     * @notice Get all beneficiaries
     * @return Array of beneficiary structs
     */
    function getBeneficiaries() external view returns (Beneficiary[] memory) {
        return beneficiaries;
    }

    /**
     * @notice Get all token configurations (deprecated - token configs are now per-beneficiary)
     * @return Empty array (for backward compatibility)
     */
    function getTokenConfigs()
        external
        pure
        returns (address[] memory, uint256[] memory, bool[] memory, address[] memory)
    {
        // Return empty arrays for backward compatibility
        return (new address[](0), new uint256[](0), new bool[](0), new address[](0));
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

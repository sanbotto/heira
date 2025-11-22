// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICoinbaseTrade.sol";

/**
 * @title MockCoinbaseTrade
 * @notice Mock implementation of Coinbase Trade for testing
 * @dev Simulates 1:1 swap for testing purposes
 */
contract MockCoinbaseTrade is ICoinbaseTrade {
    function executeSwap(SwapParams calldata params) external override returns (uint256 amountOut) {
        IERC20 tokenIn = IERC20(params.tokenIn);
        IERC20 tokenOut = IERC20(params.tokenOut);

        // Transfer input tokens from caller
        tokenIn.transferFrom(msg.sender, address(this), params.amountIn);

        // For testing: assume 1:1 swap (in production, this would call Coinbase API)
        amountOut = params.amountIn;

        // Mint output tokens (in real scenario, these would come from Coinbase)
        // For testing, we'll just transfer back the same amount
        // In production, this contract would hold the target tokens

        return amountOut;
    }
}

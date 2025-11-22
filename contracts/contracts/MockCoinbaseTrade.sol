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
    function executeSwap(SwapParams calldata params) external payable override returns (uint256 amountOut) {
        if (params.tokenIn == address(0)) {
            // Native ETH swap - value should be sent with the call
            require(msg.value == params.amountIn, "ETH amount mismatch");
            // For testing: assume 1:1 swap (in production, this would call Coinbase API)
            amountOut = params.amountIn;
            // In production, Coinbase Trade would send target tokens to recipient
            // For testing, we'll just return the amount (target tokens would be minted/transferred)
        } else {
            // ERC20 token swap
            IERC20 tokenIn = IERC20(params.tokenIn);

            // Transfer input tokens from caller
            tokenIn.transferFrom(msg.sender, address(this), params.amountIn);

            // For testing: assume 1:1 swap (in production, this would call Coinbase API)
            amountOut = params.amountIn;

            // Mint output tokens (in real scenario, these would come from Coinbase)
            // For testing, we'll just transfer back the same amount
            // In production, this contract would hold the target tokens
        }

        return amountOut;
    }
}

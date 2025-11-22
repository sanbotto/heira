// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICoinbaseTrade
 * @notice Interface for Coinbase CDP Trade API integration
 * @dev This interface defines the structure for swap operations
 */
interface ICoinbaseTrade {
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
    }

    /**
     * @notice Execute a token swap via Coinbase CDP Trade API
     * @param params Swap parameters including tokens, amounts, and recipient
     * @return amountOut The amount of output tokens received
     * @dev If tokenIn is address(0), ETH value must be sent with this call
     */
    function executeSwap(SwapParams calldata params) external payable returns (uint256 amountOut);
}

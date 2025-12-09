/**
 * Shared constants for escrow contracts
 * Consolidates ABI definitions and other shared constants
 */

/**
 * Minimal ABI for keeper operations
 */
export const KEEPER_ESCROW_ABI = [
  'function canExecute() external view returns (bool)',
  'function run() external',
  'function status() external view returns (uint8)',
  'function getTimeUntilExecution() external view returns (uint256)',
] as const;

/**
 * Minimal ABI for escrow validation (inactivityPeriod)
 */
export const ESCROW_VALIDATION_ABI = ['function inactivityPeriod() external view returns (uint256)'] as const;

/**
 * Valid networks for verification
 */
export const VALID_NETWORKS = ['sepolia', 'baseSepolia', 'citreaTestnet'] as const;

/**
 * Escrow storage service that uses FileStorageAdapter by default
 * Can be configured to use D1 via environment variable USE_D1_STORAGE=true
 */

import { FileStorageAdapter } from '../../../workers/shared/storage/file-adapter.js';
import type { EscrowMetadata, StorageAdapter } from '../../../workers/shared/types.js';

// Export the type for compatibility
export type { EscrowMetadata };

// Use file storage by default, or D1 if configured
// For D1, we would need to implement a D1 HTTP API client
// For now, we'll use file storage as the fallback
let storageAdapter: StorageAdapter;

function getStorageAdapter(): StorageAdapter {
  if (storageAdapter) {
    return storageAdapter;
  }

  // Check if D1 storage is requested
  const useD1 = process.env.USE_D1_STORAGE === 'true';

  if (useD1) {
    // TODO: Implement D1 HTTP API client for Express fallback
    // For now, fall back to file storage
    console.warn(
      'D1 storage requested but not implemented for Express fallback. Using file storage.'
    );
  }

  // Use file storage adapter
  storageAdapter = new FileStorageAdapter();
  return storageAdapter;
}

/**
 * Add an escrow to storage
 */
export async function addEscrow(metadata: EscrowMetadata): Promise<void> {
  return getStorageAdapter().addEscrow(metadata);
}

/**
 * Remove an escrow from storage
 */
export async function removeEscrow(escrowAddress: string, network: string): Promise<boolean> {
  return getStorageAdapter().removeEscrow(escrowAddress, network);
}

/**
 * Get all escrows
 */
export async function getEscrows(): Promise<EscrowMetadata[]> {
  return getStorageAdapter().getEscrows();
}

/**
 * Get escrows for a specific network
 */
export async function getEscrowsByNetwork(network: string): Promise<EscrowMetadata[]> {
  return getStorageAdapter().getEscrowsByNetwork(network);
}

/**
 * Get a specific escrow
 */
export async function getEscrow(
  escrowAddress: string,
  network: string
): Promise<EscrowMetadata | null> {
  return getStorageAdapter().getEscrow(escrowAddress, network);
}

/**
 * Update last email sent timestamp for an escrow
 */
export async function updateLastEmailSent(
  escrowAddress: string,
  network: string,
  timestamp: number
): Promise<void> {
  return getStorageAdapter().updateLastEmailSent(escrowAddress, network, timestamp);
}

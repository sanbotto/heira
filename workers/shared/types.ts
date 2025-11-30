/**
 * Shared types for Workers and Express fallback
 */

export interface EscrowMetadata {
  escrowAddress: string;
  network: string;
  email?: string;
  inactivityPeriod: number; // in seconds
  createdAt: number; // timestamp
  lastEmailSent?: number; // timestamp
}

export interface StorageAdapter {
  getEscrows(): Promise<EscrowMetadata[]>;
  getEscrowsByNetwork(network: string): Promise<EscrowMetadata[]>;
  getEscrow(
    escrowAddress: string,
    network: string,
  ): Promise<EscrowMetadata | null>;
  addEscrow(metadata: EscrowMetadata): Promise<void>;
  removeEscrow(escrowAddress: string, network: string): Promise<boolean>;
  updateLastEmailSent(
    escrowAddress: string,
    network: string,
    timestamp: number,
  ): Promise<void>;
}

export interface VerifyEscrowRequest {
  escrowAddress: string;
  mainWallet: string;
  inactivityPeriod: number;
  owner: string;
  network: string;
}

export interface VerifyEscrowResponse {
  success: boolean;
  message: string;
  explorerUrl?: string;
  alreadyVerified?: boolean;
  verificationNote?: string;
  details?: string;
}

export interface KeeperConfig {
  privateKey: string;
  networks: Array<{
    name: string;
    factoryAddress: string;
    rpcUrl: string;
  }>;
  checkIntervalMs: number;
}

export interface NetworkConfig {
  name: string;
  factoryAddress: string;
  rpcUrl: string;
}

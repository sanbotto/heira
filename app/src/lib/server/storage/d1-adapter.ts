/**
 * D1 Storage Adapter for escrow metadata
 * Implements StorageAdapter interface for Cloudflare D1 database
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface EscrowMetadata {
  escrowAddress: string;
  network: string;
  email?: string;
  inactivityPeriod: number;
  createdAt: number;
  lastEmailSent?: number;
}

export interface StorageAdapter {
  addEscrow(metadata: EscrowMetadata): Promise<void>;
  removeEscrow(escrowAddress: string, network: string): Promise<boolean>;
  getEscrows(): Promise<EscrowMetadata[]>;
  getEscrowsByNetwork(network: string): Promise<EscrowMetadata[]>;
  getEscrow(escrowAddress: string, network: string): Promise<EscrowMetadata | null>;
  updateLastEmailSent(escrowAddress: string, network: string, timestamp: number): Promise<void>;
}

export class D1StorageAdapter implements StorageAdapter {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Add an escrow to storage
   */
  async addEscrow(metadata: EscrowMetadata): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO escrows 
        (escrow_address, network, email, inactivity_period, created_at, last_email_sent) 
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        metadata.escrowAddress.toLowerCase(),
        metadata.network,
        metadata.email || null,
        metadata.inactivityPeriod,
        metadata.createdAt,
        metadata.lastEmailSent || null
      )
      .run();
  }

  /**
   * Remove an escrow from storage
   */
  async removeEscrow(escrowAddress: string, network: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM escrows WHERE escrow_address = ? AND network = ?`
      )
      .bind(escrowAddress.toLowerCase(), network)
      .run();

    return (result.meta.changes || 0) > 0;
  }

  /**
   * Get all escrows
   */
  async getEscrows(): Promise<EscrowMetadata[]> {
    const result = await this.db
      .prepare(`SELECT * FROM escrows ORDER BY created_at DESC`)
      .all<{
        id: number;
        escrow_address: string;
        network: string;
        email: string | null;
        inactivity_period: number;
        created_at: number;
        last_email_sent: number | null;
      }>();

    return (result.results || []).map((row) => ({
      escrowAddress: row.escrow_address,
      network: row.network,
      email: row.email || undefined,
      inactivityPeriod: row.inactivity_period,
      createdAt: row.created_at,
      lastEmailSent: row.last_email_sent || undefined,
    }));
  }

  /**
   * Get escrows for a specific network
   */
  async getEscrowsByNetwork(network: string): Promise<EscrowMetadata[]> {
    const result = await this.db
      .prepare(`SELECT * FROM escrows WHERE network = ? ORDER BY created_at DESC`)
      .bind(network)
      .all<{
        id: number;
        escrow_address: string;
        network: string;
        email: string | null;
        inactivity_period: number;
        created_at: number;
        last_email_sent: number | null;
      }>();

    return (result.results || []).map((row) => ({
      escrowAddress: row.escrow_address,
      network: row.network,
      email: row.email || undefined,
      inactivityPeriod: row.inactivity_period,
      createdAt: row.created_at,
      lastEmailSent: row.last_email_sent || undefined,
    }));
  }

  /**
   * Get a specific escrow
   */
  async getEscrow(escrowAddress: string, network: string): Promise<EscrowMetadata | null> {
    const result = await this.db
      .prepare(
        `SELECT * FROM escrows WHERE escrow_address = ? AND network = ?`
      )
      .bind(escrowAddress.toLowerCase(), network)
      .first<{
        id: number;
        escrow_address: string;
        network: string;
        email: string | null;
        inactivity_period: number;
        created_at: number;
        last_email_sent: number | null;
      }>();

    if (!result) {
      return null;
    }

    return {
      escrowAddress: result.escrow_address,
      network: result.network,
      email: result.email || undefined,
      inactivityPeriod: result.inactivity_period,
      createdAt: result.created_at,
      lastEmailSent: result.last_email_sent || undefined,
    };
  }

  /**
   * Update last email sent timestamp for an escrow
   */
  async updateLastEmailSent(
    escrowAddress: string,
    network: string,
    timestamp: number
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE escrows SET last_email_sent = ? WHERE escrow_address = ? AND network = ?`
      )
      .bind(timestamp, escrowAddress.toLowerCase(), network)
      .run();
  }
}

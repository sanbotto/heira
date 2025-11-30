/**
 * File system storage adapter for Express fallback
 * This is a compatibility layer that can be used when D1 is not available
 */

import type { EscrowMetadata, StorageAdapter } from "../types.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FileStorageAdapter implements StorageAdapter {
  private dataDir: string;
  private escrowsFile: string;

  constructor(dataDir?: string) {
    // Default to backend/data if no directory specified
    this.dataDir = dataDir || path.resolve(__dirname, "../../../backend/data");
    this.escrowsFile = path.join(this.dataDir, "escrows.json");
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  private async loadEscrows(): Promise<EscrowMetadata[]> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.escrowsFile, "utf-8");
      const trimmedData = data.trim();
      if (!trimmedData) {
        return [];
      }
      const parsed = JSON.parse(trimmedData);
      if (!Array.isArray(parsed)) {
        console.warn(
          "Escrows file does not contain an array, initializing empty array",
        );
        await this.saveEscrows([]);
        return [];
      }
      return parsed;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      if (error instanceof SyntaxError || error.name === "SyntaxError") {
        console.warn(
          "Invalid JSON in escrows file, initializing empty array:",
          error.message,
        );
        await this.saveEscrows([]);
        return [];
      }
      throw error;
    }
  }

  private async saveEscrows(escrows: EscrowMetadata[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(
      this.escrowsFile,
      JSON.stringify(escrows, null, 2),
      "utf-8",
    );
  }

  private getEscrowKey(escrowAddress: string, network: string): string {
    return `${network}:${escrowAddress.toLowerCase()}`;
  }

  async getEscrows(): Promise<EscrowMetadata[]> {
    return this.loadEscrows();
  }

  async getEscrowsByNetwork(network: string): Promise<EscrowMetadata[]> {
    const escrows = await this.loadEscrows();
    return escrows.filter((e) => e.network === network);
  }

  async getEscrow(
    escrowAddress: string,
    network: string,
  ): Promise<EscrowMetadata | null> {
    const escrows = await this.loadEscrows();
    const key = this.getEscrowKey(escrowAddress, network);
    return (
      escrows.find(
        (e) => this.getEscrowKey(e.escrowAddress, e.network) === key,
      ) || null
    );
  }

  async addEscrow(metadata: EscrowMetadata): Promise<void> {
    const escrows = await this.loadEscrows();
    const key = this.getEscrowKey(metadata.escrowAddress, metadata.network);
    const existingIndex = escrows.findIndex(
      (e) => this.getEscrowKey(e.escrowAddress, e.network) === key,
    );

    if (existingIndex >= 0) {
      escrows[existingIndex] = {
        ...escrows[existingIndex],
        ...metadata,
        createdAt: escrows[existingIndex].createdAt,
      };
    } else {
      escrows.push({
        ...metadata,
        createdAt: metadata.createdAt || Date.now(),
      });
    }

    await this.saveEscrows(escrows);
  }

  async removeEscrow(escrowAddress: string, network: string): Promise<boolean> {
    const escrows = await this.loadEscrows();
    const key = this.getEscrowKey(escrowAddress, network);
    const initialLength = escrows.length;
    const filtered = escrows.filter(
      (e) => this.getEscrowKey(e.escrowAddress, e.network) !== key,
    );

    if (filtered.length < initialLength) {
      await this.saveEscrows(filtered);
      return true;
    }

    return false;
  }

  async updateLastEmailSent(
    escrowAddress: string,
    network: string,
    timestamp: number,
  ): Promise<void> {
    const escrows = await this.loadEscrows();
    const key = this.getEscrowKey(escrowAddress, network);
    const escrow = escrows.find(
      (e) => this.getEscrowKey(e.escrowAddress, e.network) === key,
    );

    if (escrow) {
      escrow.lastEmailSent = timestamp;
      await this.saveEscrows(escrows);
    } else {
      console.warn(
        `Cannot update lastEmailSent: escrow ${escrowAddress} on ${network} not found in storage`,
      );
    }
  }
}

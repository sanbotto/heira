import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EscrowMetadata {
  escrowAddress: string;
  network: string;
  email?: string;
  inactivityPeriod: number; // in seconds
  createdAt: number; // timestamp
  lastEmailSent?: number; // timestamp
}

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const ESCROWS_FILE = path.join(DATA_DIR, "escrows.json");

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

/**
 * Load escrows from JSON file
 */
async function loadEscrows(): Promise<EscrowMetadata[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(ESCROWS_FILE, "utf-8");

    // Handle empty file or whitespace-only content
    const trimmedData = data.trim();
    if (!trimmedData) {
      return [];
    }

    const parsed = JSON.parse(trimmedData);

    // Ensure parsed data is an array
    if (!Array.isArray(parsed)) {
      console.warn(
        `[${new Date().toISOString()}] Escrows file does not contain an array, initializing empty array. Found type: ${typeof parsed}`,
      );
      // Try to backup the invalid file
      try {
        const backupPath = `${ESCROWS_FILE}.backup.${Date.now()}`;
        await fs.copyFile(ESCROWS_FILE, backupPath);
        console.log(`Backed up invalid file to ${backupPath}`);
      } catch (backupError) {
        // Ignore backup errors
      }
      // Initialize with empty array
      await saveEscrows([]);
      return [];
    }

    return parsed;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File doesn't exist yet, return empty array
      return [];
    }

    // Handle JSON parsing errors (empty file, invalid JSON, etc.)
    if (error instanceof SyntaxError || error.name === "SyntaxError") {
      console.warn(
        `[${new Date().toISOString()}] Invalid JSON in escrows file, initializing empty array:`,
        error.message,
      );
      // Try to backup the corrupted file
      try {
        const backupPath = `${ESCROWS_FILE}.backup.${Date.now()}`;
        await fs.copyFile(ESCROWS_FILE, backupPath);
        console.log(`Backed up corrupted file to ${backupPath}`);
      } catch (backupError) {
        // Ignore backup errors
      }
      // Initialize with empty array
      await saveEscrows([]);
      return [];
    }

    throw error;
  }
}

/**
 * Save escrows to JSON file
 */
async function saveEscrows(escrows: EscrowMetadata[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(ESCROWS_FILE, JSON.stringify(escrows, null, 2), "utf-8");
}

/**
 * Get unique key for an escrow (address + network)
 */
function getEscrowKey(escrowAddress: string, network: string): string {
  return `${network}:${escrowAddress.toLowerCase()}`;
}

/**
 * Add an escrow to storage
 */
export async function addEscrow(metadata: EscrowMetadata): Promise<void> {
  const escrows = await loadEscrows();
  const key = getEscrowKey(metadata.escrowAddress, metadata.network);

  // Check if escrow already exists
  const existingIndex = escrows.findIndex(
    (e) => getEscrowKey(e.escrowAddress, e.network) === key,
  );

  if (existingIndex >= 0) {
    // Update existing escrow
    escrows[existingIndex] = {
      ...escrows[existingIndex],
      ...metadata,
      createdAt: escrows[existingIndex].createdAt, // Preserve original creation time
    };
  } else {
    // Add new escrow
    escrows.push({
      ...metadata,
      createdAt: metadata.createdAt || Date.now(),
    });
  }

  await saveEscrows(escrows);
}

/**
 * Remove an escrow from storage
 */
export async function removeEscrow(
  escrowAddress: string,
  network: string,
): Promise<boolean> {
  const escrows = await loadEscrows();
  const key = getEscrowKey(escrowAddress, network);

  const initialLength = escrows.length;
  const filtered = escrows.filter(
    (e) => getEscrowKey(e.escrowAddress, e.network) !== key,
  );

  if (filtered.length < initialLength) {
    await saveEscrows(filtered);
    return true;
  }

  return false;
}

/**
 * Get all escrows
 */
export async function getEscrows(): Promise<EscrowMetadata[]> {
  return loadEscrows();
}

/**
 * Get escrows for a specific network
 */
export async function getEscrowsByNetwork(
  network: string,
): Promise<EscrowMetadata[]> {
  const escrows = await loadEscrows();
  return escrows.filter((e) => e.network === network);
}

/**
 * Get a specific escrow
 */
export async function getEscrow(
  escrowAddress: string,
  network: string,
): Promise<EscrowMetadata | null> {
  const escrows = await loadEscrows();
  const key = getEscrowKey(escrowAddress, network);

  return (
    escrows.find((e) => getEscrowKey(e.escrowAddress, e.network) === key) ||
    null
  );
}

/**
 * Update last email sent timestamp for an escrow
 */
export async function updateLastEmailSent(
  escrowAddress: string,
  network: string,
  timestamp: number,
): Promise<void> {
  const escrows = await loadEscrows();
  const key = getEscrowKey(escrowAddress, network);

  const escrow = escrows.find(
    (e) => getEscrowKey(e.escrowAddress, e.network) === key,
  );

  if (escrow) {
    escrow.lastEmailSent = timestamp;
    await saveEscrows(escrows);
  } else {
    console.warn(
      `Cannot update lastEmailSent: escrow ${escrowAddress} on ${network} not found in storage`,
    );
  }
}

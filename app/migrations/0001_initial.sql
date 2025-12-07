-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Escrows table for storing escrow metadata
CREATE TABLE IF NOT EXISTS escrows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  escrow_address TEXT NOT NULL,
  network TEXT NOT NULL,
  email TEXT,
  inactivity_period INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_email_sent INTEGER,
  UNIQUE(escrow_address, network)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_escrows_address ON escrows(escrow_address);
CREATE INDEX IF NOT EXISTS idx_escrows_network ON escrows(network);
CREATE INDEX IF NOT EXISTS idx_escrows_address_network ON escrows(escrow_address, network);

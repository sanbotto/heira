-- D1 Database schema for escrows
-- Run this with: wrangler d1 execute heira-db --file=./workers/shared/d1-schema.sql

CREATE TABLE IF NOT EXISTS escrows (
  escrow_address TEXT NOT NULL,
  network TEXT NOT NULL,
  email TEXT,
  inactivity_period INTEGER,
  created_at INTEGER,
  last_email_sent INTEGER,
  PRIMARY KEY (escrow_address, network)
);

CREATE INDEX IF NOT EXISTS idx_network ON escrows(network);
CREATE INDEX IF NOT EXISTS idx_created_at ON escrows(created_at);

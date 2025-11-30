// D1 Database storage adapter for Cloudflare Workers

export class D1StorageAdapter {
  constructor(db) {
    this.db = db;
  }

  async getEscrows() {
    const result = await this.db
      .prepare("SELECT * FROM escrows ORDER BY created_at DESC")
      .all();
    return result.results || [];
  }

  async getEscrowsByNetwork(network) {
    const result = await this.db
      .prepare(
        "SELECT * FROM escrows WHERE network = ? ORDER BY created_at DESC",
      )
      .bind(network)
      .all();
    return result.results || [];
  }

  async getEscrow(escrowAddress, network) {
    const result = await this.db
      .prepare("SELECT * FROM escrows WHERE escrow_address = ? AND network = ?")
      .bind(escrowAddress.toLowerCase(), network)
      .first();
    return result || null;
  }

  async addEscrow(metadata) {
    const existing = await this.getEscrow(
      metadata.escrowAddress,
      metadata.network,
    );

    if (existing) {
      // Update existing escrow
      await this.db
        .prepare(
          `UPDATE escrows 
           SET email = ?, inactivity_period = ?, last_email_sent = ?
           WHERE escrow_address = ? AND network = ?`,
        )
        .bind(
          metadata.email || null,
          metadata.inactivityPeriod,
          metadata.lastEmailSent || null,
          metadata.escrowAddress.toLowerCase(),
          metadata.network,
        )
        .run();
    } else {
      // Insert new escrow
      await this.db
        .prepare(
          `INSERT INTO escrows (escrow_address, network, email, inactivity_period, created_at, last_email_sent)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          metadata.escrowAddress.toLowerCase(),
          metadata.network,
          metadata.email || null,
          metadata.inactivityPeriod,
          metadata.createdAt || Date.now(),
          metadata.lastEmailSent || null,
        )
        .run();
    }
  }

  async removeEscrow(escrowAddress, network) {
    const result = await this.db
      .prepare("DELETE FROM escrows WHERE escrow_address = ? AND network = ?")
      .bind(escrowAddress.toLowerCase(), network)
      .run();
    return result.success && (result.meta.changes || 0) > 0;
  }

  async updateLastEmailSent(escrowAddress, network, timestamp) {
    await this.db
      .prepare(
        "UPDATE escrows SET last_email_sent = ? WHERE escrow_address = ? AND network = ?",
      )
      .bind(timestamp, escrowAddress.toLowerCase(), network)
      .run();
  }
}

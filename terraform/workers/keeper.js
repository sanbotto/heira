// Shared keeper logic for monitoring and executing escrows
// Note: This file requires ethers to be imported at the top level
// In Terraform, add: import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6/+esm';
// sendInactivityWarning is available from concatenated email.js file

// ABI for InheritanceEscrow contract (minimal needed for keeper)
const ESCROW_ABI = [
  "function canExecute() external view returns (bool)",
  "function run() external",
  "function status() external view returns (uint8)",
  "function getTimeUntilExecution() external view returns (uint256)",
];

// Check a single escrow contract to see if it can be executed
export async function checkEscrow(
  escrowAddress,
  networkName,
  provider,
  signer,
) {
  try {
    const escrowContract = new ethers.Contract(
      escrowAddress,
      ESCROW_ABI,
      provider,
    );
    const canExecute = await escrowContract.canExecute();

    if (!canExecute) {
      const timeUntilExecution = await escrowContract.getTimeUntilExecution();
      console.log(
        `Escrow ${escrowAddress} on ${networkName}: Not ready (${timeUntilExecution}s remaining)`,
      );
      return { canExecute: false, executed: false };
    }

    // Execute the escrow
    console.log(`Executing escrow ${escrowAddress} on ${networkName}...`);
    const escrowWithSigner = new ethers.Contract(
      escrowAddress,
      ESCROW_ABI,
      signer,
    );
    const tx = await escrowWithSigner.run();
    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(
      `Escrow ${escrowAddress} executed successfully. Tx: ${receipt.hash}`,
    );

    return { canExecute: true, executed: true };
  } catch (error) {
    const errorMessage = error.message || String(error);
    console.error(
      `Error checking escrow ${escrowAddress} on ${networkName}:`,
      errorMessage,
    );

    // Check if it's already been executed or is inactive
    if (
      errorMessage.includes("Execution conditions not met") ||
      errorMessage.includes("Contract is inactive") ||
      errorMessage.includes("No beneficiaries configured")
    ) {
      return { canExecute: false, executed: false };
    }

    return { canExecute: false, executed: false, error: errorMessage };
  }
}

// Check for escrows approaching inactivity period and send email warnings
export async function checkInactivityWarnings(
  network,
  storage,
  provider,
  fetchFn = fetch,
  mailpaceApiToken,
  mailpaceFromEmail,
) {
  try {
    const managedEscrows = await storage.getEscrowsByNetwork(network.name);
    const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60; // 604800 seconds
    const SIX_DAYS_SECONDS = 6 * 24 * 60 * 60; // 518400 seconds

    console.log(
      `Checking ${managedEscrows.length} escrows for inactivity warnings on ${network.name}`,
    );

    for (const escrowMetadata of managedEscrows) {
      console.log(
        `Processing escrow ${escrowMetadata.escrow_address} on ${network.name}: email=${escrowMetadata.email || "none"}, last_email_sent=${escrowMetadata.last_email_sent || "never"}`,
      );

      // Skip if no email provided
      if (!escrowMetadata.email) {
        console.log(
          `Skipping email check for escrow ${escrowMetadata.escrow_address} on ${network.name}: no email configured`,
        );
        continue;
      }

      try {
        const escrowContract = new ethers.Contract(
          escrowMetadata.escrow_address,
          ESCROW_ABI,
          provider,
        );

        // Check contract status - skip if inactive
        const status = await escrowContract.status();
        const statusNumber = Number(status);
        console.log(
          `Escrow ${escrowMetadata.escrow_address} on ${network.name} status check: raw=${status}, number=${statusNumber}`,
        );

        if (statusNumber !== 0) {
          console.log(
            `Skipping email check for escrow ${escrowMetadata.escrow_address} on ${network.name}: contract is inactive (status: ${statusNumber}, expected 0 for Active)`,
          );
          continue;
        }

        console.log(
          `Escrow ${escrowMetadata.escrow_address} on ${network.name} is Active (status: ${statusNumber}), proceeding with email check`,
        );

        const timeUntilExecution = await escrowContract.getTimeUntilExecution();
        const daysRemaining = Number(timeUntilExecution) / (24 * 60 * 60);

        console.log(
          `Checking email notification for escrow ${escrowMetadata.escrow_address} on ${network.name}: ${daysRemaining.toFixed(2)} days remaining`,
        );

        // Check if time remaining is <= 7 days and > 0
        if (
          timeUntilExecution > 0 &&
          timeUntilExecution <= BigInt(ONE_WEEK_SECONDS)
        ) {
          // Check if email was already sent
          const shouldSendEmail =
            !escrowMetadata.last_email_sent ||
            Date.now() - escrowMetadata.last_email_sent > SIX_DAYS_SECONDS * 1000;

          if (!shouldSendEmail && escrowMetadata.last_email_sent) {
            const daysSinceLastEmail =
              (Date.now() - escrowMetadata.last_email_sent) /
              (24 * 60 * 60 * 1000);
            console.log(
              `Skipping email for escrow ${escrowMetadata.escrow_address} on ${network.name}: email already sent ${daysSinceLastEmail.toFixed(2)} days ago`,
            );
          }

          if (shouldSendEmail) {
            console.log(
              `Sending inactivity warning email for escrow ${escrowMetadata.escrow_address} on ${network.name} (${daysRemaining.toFixed(1)} days remaining)`,
            );

            try {
              await sendInactivityWarning(
                {
                  to: escrowMetadata.email,
                  escrowAddress: escrowMetadata.escrow_address,
                  network: network.name,
                  daysRemaining: daysRemaining,
                },
                fetchFn,
                mailpaceApiToken,
                mailpaceFromEmail,
              );

              // Update last email sent timestamp only after successful send
              await storage.updateLastEmailSent(
                escrowMetadata.escrow_address,
                network.name,
                Date.now(),
              );
              console.log(
                `Updated lastEmailSent timestamp for escrow ${escrowMetadata.escrow_address}`,
              );
            } catch (emailError) {
              console.error(
                `Failed to send email for escrow ${escrowMetadata.escrow_address}:`,
                emailError.message,
              );
              // Don't update timestamp if email failed - will retry on next check
            }
          }
        } else {
          console.log(
            `Skipping email for escrow ${escrowMetadata.escrow_address} on ${network.name}: time until execution (${daysRemaining.toFixed(2)} days) is not within 7-day warning window`,
          );
        }
      } catch (error) {
        console.error(
          `Error checking inactivity warning for escrow ${escrowMetadata.escrow_address}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error(
      `Error checking inactivity warnings for network ${network.name}:`,
      error.message,
    );
  }
}

// Check all escrows on a specific network
export async function checkNetwork(
  network,
  storage,
  provider,
  signer,
) {
  const result = {
    checked: 0,
    executed: 0,
    errors: 0,
  };

  try {
    // Get managed escrows from storage
    const managedEscrows = await storage.getEscrowsByNetwork(network.name);

    console.log(
      `Checking ${managedEscrows.length} managed escrows on ${network.name}...`,
    );

    for (const escrowMetadata of managedEscrows) {
      result.checked++;
      const checkResult = await checkEscrow(
        escrowMetadata.escrow_address,
        network.name,
        provider,
        signer,
      );

      if (checkResult.executed) {
        result.executed++;
      }
      if (checkResult.error) {
        result.errors++;
      }

      // Small delay between checks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`Error checking network ${network.name}:`, error.message);
    result.errors++;
  }

  return result;
}

// Run a single check cycle across all networks
export async function runKeeperCheck(
  networks,
  storage,
  privateKey,
  fetchFn = fetch,
  mailpaceApiToken,
  mailpaceFromEmail,
) {
  const totalResult = {
    checked: 0,
    executed: 0,
    errors: 0,
  };

  console.log(`[${new Date().toISOString()}] Running keeper check...`);

  for (const network of networks) {
    try {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);

      // Check for inactivity warnings first
      await checkInactivityWarnings(network, storage, provider, fetchFn, mailpaceApiToken, mailpaceFromEmail);

      // Then check for escrows ready to execute
      const networkResult = await checkNetwork(
        network,
        storage,
        provider,
        wallet,
      );

      totalResult.checked += networkResult.checked;
      totalResult.executed += networkResult.executed;
      totalResult.errors += networkResult.errors;
    } catch (error) {
      console.error(`Error processing network ${network.name}:`, error.message);
      totalResult.errors++;
    }
  }

  console.log(`[${new Date().toISOString()}] Keeper check completed.`);
  console.log(
    `Results: ${totalResult.checked} checked, ${totalResult.executed} executed, ${totalResult.errors} errors`,
  );

  return totalResult;
}

const hre = require("hardhat");

/**
 * Verify an escrow contract on Etherscan/Basescan
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... MAIN_WALLET=0x... INACTIVITY_PERIOD=7776000 OWNER=0x... npx hardhat run scripts/verify-escrow.js --network sepolia
 */
async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const mainWallet = process.env.MAIN_WALLET;
  const inactivityPeriod = process.env.INACTIVITY_PERIOD;
  const owner = process.env.OWNER;

  if (!contractAddress || !mainWallet || !inactivityPeriod || !owner) {
    console.error("Error: Missing required environment variables");
    console.log("\nUsage:");
    console.log(
      "  CONTRACT_ADDRESS=0x... MAIN_WALLET=0x... INACTIVITY_PERIOD=7776000 OWNER=0x... npx hardhat run scripts/verify-escrow.js --network <network>"
    );
    process.exit(1);
  }

  const network = hre.network.name;
  console.log(`Verifying escrow contract on ${network}...`);
  console.log(`Contract: ${contractAddress}`);

  try {
    console.log("Starting verification...");

    // Parse inactivity period as BigInt
    const inactivityPeriodBigInt = BigInt(inactivityPeriod);

    // Verify the escrow contract with constructor arguments
    // Use force flag to always verify (even if already verified)
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [mainWallet, inactivityPeriodBigInt, owner],
      force: true,
    });

    console.log("\n✅ Escrow contract verified successfully!");
    console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
  } catch (error) {
    // Check if it's an "already verified" case, which is actually a success
    const errorMessage = error.message || String(error);
    const isAlreadyVerified =
      errorMessage.includes("Already Verified") ||
      errorMessage.includes("already verified") ||
      errorMessage.includes("Contract source code already verified");

    if (isAlreadyVerified) {
      // This is a success case, contract is already verified
      console.log("\n✅ Escrow contract is already verified!");
      console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
      process.exit(0);
    } else {
      // Real error
      console.error("\n❌ Verification failed:");
      console.error("Error message:", error.message);
      if (error.stack) {
        console.error("\nFull error details:");
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

function getExplorerUrl(network, address) {
  const explorers = {
    mainnet: `https://etherscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    base: `https://basescan.org/address/${address}`,
    baseSepolia: `https://sepolia.basescan.org/address/${address}`,
  };
  return explorers[network] || `https://explorer.unknown.network/address/${address}`;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

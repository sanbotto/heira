const hre = require("hardhat");

/**
 * Verify an escrow contract immediately after creation
 *
 * This script fetches the escrow creation event from a transaction hash
 * and automatically verifies the escrow contract.
 *
 * Usage:
 *   TX_HASH=0x... FACTORY_ADDRESS=0x... npx hardhat run scripts/verify-escrow-after-create.js --network sepolia
 */
async function main() {
  const txHash = process.env.TX_HASH;
  const factoryAddress = process.env.FACTORY_ADDRESS;

  if (!txHash || !factoryAddress) {
    console.error("Error: Missing required environment variables");
    console.log("\nUsage:");
    console.log(
      "  TX_HASH=0x... FACTORY_ADDRESS=0x... npx hardhat run scripts/verify-escrow-after-create.js --network <network>"
    );
    console.log("\nExample:");
    console.log(
      "  TX_HASH=0x123... FACTORY_ADDRESS=0x456... npx hardhat run scripts/verify-escrow-after-create.js --network sepolia"
    );
    process.exit(1);
  }

  const network = hre.network.name;
  console.log(`Verifying escrow from transaction on ${network}...`);
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`Factory Address: ${factoryAddress}`);

  // Check if API key is configured
  const apiKey = hre.config.etherscan?.apiKey?.[network] || hre.config.etherscan?.apiKey;
  if (!apiKey || apiKey === "") {
    console.error("Error: Etherscan API key not configured for this network");
    console.log(`Please set ETHERSCAN_API_KEY in your .env file`);
    process.exit(1);
  }

  try {
    const provider = hre.ethers.provider;

    // Wait for transaction to be confirmed
    console.log("Waiting for transaction confirmation...");
    const receipt = await provider.waitForTransaction(txHash, 1, 60000); // Wait up to 60 seconds

    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Factory ABI - we only need the EscrowCreated event
    const factoryABI = [
      "event EscrowCreated(address indexed escrow, address indexed owner, address indexed mainWallet, uint256 inactivityPeriod)",
    ];

    const factory = new hre.ethers.Contract(factoryAddress, factoryABI, provider);

    // Find EscrowCreated event in the transaction receipt
    const event = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "EscrowCreated");

    if (!event) {
      throw new Error(`EscrowCreated event not found in transaction ${txHash}. Make sure this is an escrow creation transaction.`);
    }

    const escrowAddress = event.args.escrow;
    const owner = event.args.owner;
    const mainWallet = event.args.mainWallet;
    const inactivityPeriod = event.args.inactivityPeriod;

    console.log("\nFound EscrowCreated event:");
    console.log(`  Escrow Address: ${escrowAddress}`);
    console.log(`  Owner: ${owner}`);
    console.log(`  Main Wallet: ${mainWallet}`);
    console.log(`  Inactivity Period: ${inactivityPeriod}`);

    // Wait a bit for the contract to be indexed on Etherscan
    console.log("\nWaiting for contract to be indexed on Etherscan...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify the escrow contract
    // Use force flag to always verify (even if already verified)
    console.log("Starting verification...");
    await hre.run("verify:verify", {
      address: escrowAddress,
      constructorArguments: [mainWallet, inactivityPeriod, owner],
      force: true,
    });

    console.log("\n✅ Escrow contract verified successfully!");
    console.log(`View on explorer: ${getExplorerUrl(network, escrowAddress)}`);
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
      console.log(`View on explorer: ${getExplorerUrl(network, escrowAddress)}`);
      process.exit(0);
    } else {
      // Real error
      console.error("\n❌ Verification failed:");
      console.error("Error message:", errorMessage);
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

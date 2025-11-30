const hre = require("hardhat");

/**
 * Automatically verify escrow contracts created by the factory
 *
 * This script monitors EscrowCreated events from the factory and automatically
 * verifies each escrow contract on Etherscan/Basescan.
 *
 * Usage:
 *   FACTORY_ADDRESS=0x... npx hardhat run scripts/auto-verify-escrows.js --network sepolia
 *
 * Options:
 *   FROM_BLOCK: Starting block number (default: latest - 1000)
 *   TO_BLOCK: Ending block number (default: latest)
 *   VERIFY_ALL: If set to "true", verifies all escrows from the factory (default: only new ones)
 */
async function main() {
    const factoryAddress = process.env.FACTORY_ADDRESS;

    if (!factoryAddress) {
        console.error("Error: FACTORY_ADDRESS environment variable is required");
        console.log("\nUsage:");
        console.log(
            "  FACTORY_ADDRESS=0x... npx hardhat run scripts/auto-verify-escrows.js --network <network>"
        );
        console.log("\nOptional:");
        console.log("  FROM_BLOCK=<block_number> - Starting block (default: latest - 1000)");
        console.log("  TO_BLOCK=<block_number> - Ending block (default: latest)");
        console.log("  VERIFY_ALL=true - Verify all escrows, even if already verified");
        process.exit(1);
    }

    const network = hre.network.name;
    console.log(`Auto-verifying escrows on ${network}...`);
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
        const currentBlock = await provider.getBlockNumber();

        // Determine block range
        const fromBlock = process.env.FROM_BLOCK
            ? parseInt(process.env.FROM_BLOCK)
            : Math.max(0, currentBlock - 1000);
        const toBlock = process.env.TO_BLOCK ? parseInt(process.env.TO_BLOCK) : currentBlock;

        console.log(`Scanning blocks ${fromBlock} to ${toBlock}...`);

        // Factory ABI
        const factoryABI = [
            "event EscrowCreated(address indexed escrow, address indexed owner, address indexed mainWallet, uint256 inactivityPeriod)",
        ];

        const factory = new hre.ethers.Contract(factoryAddress, factoryABI, provider);

        // Query for EscrowCreated events
        const filter = factory.filters.EscrowCreated();
        const events = await factory.queryFilter(filter, fromBlock, toBlock);

        console.log(`Found ${events.length} EscrowCreated event(s)`);

        if (events.length === 0) {
            console.log("No escrows found to verify.");
            return;
        }

        const verifyAll = process.env.VERIFY_ALL === "true";
        let verifiedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const event of events) {
            const escrowAddress = event.args.escrow;
            const owner = event.args.owner;
            const mainWallet = event.args.mainWallet;
            const inactivityPeriod = event.args.inactivityPeriod;

            console.log(`\n--- Verifying escrow: ${escrowAddress} ---`);
            console.log(`  Owner: ${owner}`);
            console.log(`  Main Wallet: ${mainWallet}`);
            console.log(`  Inactivity Period: ${inactivityPeriod}`);

            try {
                // Wait a bit to ensure the contract is indexed
                await new Promise((resolve) => setTimeout(resolve, 2000));

                await hre.run("verify:verify", {
                    address: escrowAddress,
                    constructorArguments: [mainWallet, inactivityPeriod, owner],
                });

                console.log(`Verified: ${escrowAddress}`);
                verifiedCount++;

                // Small delay between verifications to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                if (
                    error.message.includes("Already Verified") ||
                    error.message.includes("already verified")
                ) {
                    if (verifyAll) {
                        console.log(`Already verified: ${escrowAddress}`);
                    } else {
                        console.log(`Skipping (already verified): ${escrowAddress}`);
                    }
                    skippedCount++;
                } else {
                    console.error(`Failed to verify ${escrowAddress}:`);
                    console.error(`   Error: ${error.message}`);
                    failedCount++;
                }
            }
        }

        console.log("\n=== Verification Summary ===");
        console.log(`Verified: ${verifiedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Failed: ${failedCount}`);
        console.log(`Total: ${events.length}`);

        if (failedCount > 0) {
            console.log("\nSome escrows failed verification. You can try verifying them manually:");
            console.log(
                "   CONTRACT_ADDRESS=0x... MAIN_WALLET=0x... INACTIVITY_PERIOD=... OWNER=0x... npx hardhat run scripts/verify-escrow.js --network <network>"
            );
        }
    } catch (error) {
        console.error("\nError scanning for escrows:");
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

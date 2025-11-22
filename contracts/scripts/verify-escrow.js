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
        console.log("\nExample:");
        console.log(
            "  CONTRACT_ADDRESS=0x123... MAIN_WALLET=0x456... INACTIVITY_PERIOD=7776000 OWNER=0x789... npx hardhat run scripts/verify-escrow.js --network sepolia"
        );
        process.exit(1);
    }

    const network = hre.network.name;
    console.log(`Verifying escrow contract on ${network}...`);
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Main Wallet: ${mainWallet}`);
    console.log(`Inactivity Period: ${inactivityPeriod}`);
    console.log(`Owner: ${owner}`);

    // Check if API key is configured
    const apiKey = hre.config.etherscan?.apiKey?.[network] || hre.config.etherscan?.apiKey;
    if (!apiKey || apiKey === "") {
        console.error("Error: Etherscan API key not configured for this network");
        console.log(`Please set ETHERSCAN_API_KEY in your .env file`);
        console.log(`Current network: ${network}`);
        process.exit(1);
    }

    try {
        console.log("Starting verification...");

        // Parse inactivity period as BigInt
        const inactivityPeriodBigInt = BigInt(inactivityPeriod);

        // Verify the escrow contract with constructor arguments
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [mainWallet, inactivityPeriodBigInt, owner],
        });

        console.log("\n✅ Escrow contract verified successfully!");
        console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
    } catch (error) {
        if (
            error.message.includes("Already Verified") ||
            error.message.includes("already verified")
        ) {
            console.log("\n✅ Escrow contract is already verified!");
            console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
        } else {
            console.error("\n❌ Verification failed:");
            console.error("Error message:", error.message);
            if (error.stack) {
                console.error("\nFull error details:");
                console.error(error.stack);
            }
            console.error("\nTroubleshooting tips:");
            console.error("1. Ensure the contract was deployed from this codebase");
            console.error("2. Check that constructor arguments match exactly:");
            console.error(`   - Main Wallet: ${mainWallet}`);
            console.error(`   - Inactivity Period: ${inactivityPeriod}`);
            console.error(`   - Owner: ${owner}`);
            console.error("3. Check that compiler settings match (optimizer enabled, runs: 200)");
            console.error("4. Wait a few minutes after deployment for the contract to be indexed");
            console.error("5. Verify your ETHERSCAN_API_KEY is correct and has not expired");
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

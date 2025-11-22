const hre = require("hardhat");

/**
 * Verify a deployed contract on Etherscan/Basescan
 *
 * Usage:
 *   npx hardhat run scripts/verify.js --network sepolia
 *
 * Or with specific address:
 *   CONTRACT_ADDRESS=0x... npx hardhat run scripts/verify.js --network sepolia
 */
async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;

    if (!contractAddress) {
        console.error("Error: CONTRACT_ADDRESS environment variable is required");
        console.log("\nUsage:");
        console.log(
            "  CONTRACT_ADDRESS=0x... npx hardhat run scripts/verify.js --network <network>"
        );
        process.exit(1);
    }

    const network = hre.network.name;
    console.log(`Verifying contract on ${network}...`);
    console.log(`Contract Address: ${contractAddress}`);

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
        console.log(`API Key configured: ${apiKey ? "Yes" : "No"}`);

        // Verify the factory contract (no constructor arguments)
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [],
        });

        console.log("\n✅ Contract verified successfully!");
        console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
    } catch (error) {
        if (
            error.message.includes("Already Verified") ||
            error.message.includes("already verified")
        ) {
            console.log("\n✅ Contract is already verified!");
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
            console.error("2. Check that compiler settings match (optimizer enabled, runs: 200)");
            console.error("3. Wait a few minutes after deployment for the contract to be indexed");
            console.error("4. Verify your ETHERSCAN_API_KEY is correct and has not expired");
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

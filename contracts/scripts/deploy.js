const hre = require("hardhat");

async function main() {
    console.log("Deploying InheritanceEscrowFactory...");

    const InheritanceEscrowFactory = await hre.ethers.getContractFactory(
        "InheritanceEscrowFactory"
    );
    const factory = await InheritanceEscrowFactory.deploy();

    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();

    console.log("InheritanceEscrowFactory deployed to:", factoryAddress);
    console.log("Network:", hre.network.name);
    console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);

    // Verify contract on Etherscan/Basescan if API key is configured
    const networkName = hre.network.name;
    const apiKey = hre.config.etherscan?.apiKey?.[networkName] || hre.config.etherscan?.apiKey;
    if (apiKey && apiKey !== "") {
        console.log("\nWaiting for block confirmations before verification...");
        await factory.deploymentTransaction()?.wait(5);

        try {
            console.log("Verifying contract on Etherscan/Basescan...");
            await hre.run("verify:verify", {
                address: factoryAddress,
                constructorArguments: [],
            });
            console.log("✅ Contract verified successfully!");
            console.log(`View on explorer: ${getExplorerUrl(hre.network.name, factoryAddress)}`);
        } catch (error) {
            if (
                error.message.includes("Already Verified") ||
                error.message.includes("already verified")
            ) {
                console.log("✅ Contract is already verified!");
                console.log(
                    `View on explorer: ${getExplorerUrl(hre.network.name, factoryAddress)}`
                );
            } else {
                console.log("⚠️  Verification failed:", error.message);
                console.log("\nYou can verify manually later using:");
                console.log(
                    `  CONTRACT_ADDRESS=${factoryAddress} npx hardhat run scripts/verify.js --network ${hre.network.name}`
                );
                console.log("\nCommon issues:");
                console.log("- Contract may need more time to be indexed (wait 1-2 minutes)");
                console.log("- Ensure compiler settings match (optimizer enabled, runs: 200)");
            }
        }
    } else {
        console.log("\n⚠️  Etherscan API key not configured. Skipping verification.");
        console.log("To verify later, run:");
        console.log(
            `  CONTRACT_ADDRESS=${factoryAddress} npx hardhat run scripts/verify.js --network ${hre.network.name}`
        );
    }

    console.log("\n=== Deployment Summary ===");
    console.log("Factory Address:", factoryAddress);
    console.log("\nTo create an escrow, call:");
    console.log(`factory.createEscrow(mainWalletAddress, inactivityPeriodInSeconds)`);
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

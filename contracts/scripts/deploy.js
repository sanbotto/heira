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
    if (hre.network.config.etherscan) {
        console.log("\nWaiting for block confirmations...");
        await factory.deploymentTransaction()?.wait(5);

        try {
            console.log("Verifying contract...");
            await hre.run("verify:verify", {
                address: factoryAddress,
                constructorArguments: [],
            });
            console.log("Contract verified!");
        } catch (error) {
            console.log("Verification failed:", error.message);
        }
    }

    console.log("\n=== Deployment Summary ===");
    console.log("Factory Address:", factoryAddress);
    console.log("\nTo create an escrow, call:");
    console.log(`factory.createEscrow(mainWalletAddress, inactivityPeriodInSeconds)`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

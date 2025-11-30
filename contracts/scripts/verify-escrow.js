const hre = require("hardhat");
const { getExplorerUrl, isAlreadyVerified } = require("./utils");

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
        const inactivityPeriodBigInt = BigInt(inactivityPeriod);

        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [mainWallet, inactivityPeriodBigInt, owner],
            force: true,
        });

        console.log("\nEscrow contract verified successfully!");
        console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
    } catch (error) {
        if (isAlreadyVerified(error)) {
            console.log("\nEscrow contract is already verified!");
            console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
            process.exit(0);
        } else if (error.message.includes("Unable to verify")) {
            console.log("\nBlockscout verification failed, trying Sourcify...");
            try {
                const inactivityPeriodBigInt = BigInt(inactivityPeriod);
                await hre.run("verify:verify", {
                    address: contractAddress,
                    constructorArguments: [mainWallet, inactivityPeriodBigInt, owner],
                    via: "sourcify",
                });
                console.log("\nContract verified via Sourcify!");
                console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
                process.exit(0);
            } catch (sourcifyError) {
                console.log("\nVerification failed on both Blockscout and Sourcify.");
                console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
                process.exit(0);
            }
        } else {
            console.error("\nVerification failed:");
            console.error("Error message:", error.message);
            if (error.stack) {
                console.error("\nFull error details:");
                console.error(error.stack);
            }
            process.exit(1);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

const hre = require("hardhat");
const { isBlockscoutNetwork, getExplorerUrl, isAlreadyVerified } = require("./utils");

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
  const isBlockscout = isBlockscoutNetwork(network);
  console.log(`Verifying contract on ${network}...`);
  console.log(`Contract Address: ${contractAddress}`);

  const apiKey = hre.config.etherscan?.apiKey?.[network] ||
    (typeof hre.config.etherscan?.apiKey === 'string' ? hre.config.etherscan.apiKey : '') ||
    '';
  if (!isBlockscout && (!apiKey || apiKey === "")) {
    console.error("Error: Etherscan API key not configured for this network");
    console.log(`Please set ETHERSCAN_API_KEY in your .env file`);
    console.log(`Current network: ${network}`);
    process.exit(1);
  }

  try {
    console.log("Starting verification...");
    if (!isBlockscout) {
      console.log(`API Key configured: ${apiKey ? "Yes" : "No"}`);
    }

    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [],
    });

    console.log("\n✅ Contract verified successfully!");
    console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
  } catch (error) {
    if (isAlreadyVerified(error)) {
      console.log("\n✅ Contract is already verified!");
      console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
    } else if (isBlockscout && error.message.includes("Unable to verify")) {
      console.log("\n⚠️  Blockscout verification failed, trying Sourcify...");
      try {
        await hre.run("verify:verify", {
          address: contractAddress,
          constructorArguments: [],
          via: "sourcify",
        });
        console.log("\n✅ Contract verified via Sourcify!");
        console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
      } catch (sourcifyError) {
        console.log("\n⚠️  Verification failed on both Blockscout and Sourcify.");
        console.log("This is common with Blockscout - the contract may still be verifiable manually.");
        console.log(`View on explorer: ${getExplorerUrl(network, contractAddress)}`);
        console.log("Note: Contract functionality is not affected by verification status.");
        process.exit(0);
      }
    } else {
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

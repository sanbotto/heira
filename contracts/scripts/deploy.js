const hre = require("hardhat");
const { isBlockscoutNetwork, getExplorerUrl, isAlreadyVerified } = require("./utils");

async function main() {
  console.log("Cleaning old artifacts...");
  await hre.run("clean");
  console.log("Compiling contracts with latest settings...");
  await hre.run("compile");
  console.log("Compilation complete.\n");

  // Small delay to ensure compilation artifacts are fully written
  await new Promise(resolve => setTimeout(resolve, 1000));

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

  const networkName = hre.network.name;
  const apiKey = hre.config.etherscan?.apiKey?.[networkName] ||
    (typeof hre.config.etherscan?.apiKey === 'string' ? hre.config.etherscan.apiKey : '') ||
    '';
  const isBlockscout = isBlockscoutNetwork(networkName);
  const shouldVerify = apiKey !== "" || isBlockscout;

  if (shouldVerify) {
    console.log("\nWaiting for block confirmations before verification...");
    await factory.deploymentTransaction()?.wait(5);

    // Wait additional time for the contract to be fully indexed on the explorer
    console.log("Waiting for contract to be indexed on explorer (10 seconds)...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    try {
      const explorerName = isBlockscout ? 'Blockscout' : 'Etherscan/Basescan';
      console.log(`Verifying contract on ${explorerName}...`);
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [],
      });
      console.log("✅ Contract verified successfully!");
      console.log(`View on explorer: ${getExplorerUrl(networkName, factoryAddress)}`);
    } catch (error) {
      if (isAlreadyVerified(error)) {
        console.log("✅ Contract is already verified!");
        console.log(`View on explorer: ${getExplorerUrl(networkName, factoryAddress)}`);
      } else {
        console.log("Verification failed:", error.message);
        console.log("\nYou can verify manually later using:");
        console.log(
          `  CONTRACT_ADDRESS=${factoryAddress} npx hardhat run scripts/verify.js --network ${networkName}`
        );
      }
    }
  } else {
    console.log("\nAPI key not configured. Skipping verification.");
    console.log("To verify later, run:");
    console.log(
      `  CONTRACT_ADDRESS=${factoryAddress} npx hardhat run scripts/verify.js --network ${networkName}`
    );
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

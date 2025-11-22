const hre = require("hardhat");

/**
 * Programmatically verify an escrow contract
 * @param {string} escrowAddress - The escrow contract address
 * @param {string} mainWallet - The main wallet address
 * @param {string|number|bigint} inactivityPeriod - The inactivity period in seconds
 * @param {string} owner - The owner address
 * @param {string} network - The network name (e.g., 'sepolia')
 * @returns {Promise<{success: boolean, message: string, explorerUrl?: string}>}
 */
async function verifyEscrow(escrowAddress, mainWallet, inactivityPeriod, owner, network = null) {
  try {
    // Set network if provided
    if (network) {
      hre.config.networks[network] = hre.config.networks[network] || {};
    }

    const currentNetwork = network || hre.network.name;
    
    // Check if API key is configured
    const apiKey = hre.config.etherscan?.apiKey?.[currentNetwork] || hre.config.etherscan?.apiKey;
    if (!apiKey || apiKey === "") {
      return {
        success: false,
        message: `Etherscan API key not configured for network: ${currentNetwork}`
      };
    }

    // Convert inactivityPeriod to BigInt if needed
    const inactivityPeriodBigInt = typeof inactivityPeriod === 'bigint' 
      ? inactivityPeriod 
      : BigInt(inactivityPeriod);

    // Verify the escrow contract
    await hre.run("verify:verify", {
      address: escrowAddress,
      constructorArguments: [
        mainWallet,
        inactivityPeriodBigInt,
        owner
      ],
    });

    const explorerUrl = getExplorerUrl(currentNetwork, escrowAddress);
    
    return {
      success: true,
      message: "Escrow contract verified successfully",
      explorerUrl
    };
  } catch (error) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      const currentNetwork = network || hre.network.name;
      const explorerUrl = getExplorerUrl(currentNetwork, escrowAddress);
      return {
        success: true,
        message: "Escrow contract is already verified",
        explorerUrl,
        alreadyVerified: true
      };
    }
    
    return {
      success: false,
      message: error.message || "Verification failed",
      error: error.stack
    };
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

module.exports = { verifyEscrow, getExplorerUrl };

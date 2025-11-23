function isBlockscoutNetwork(network) {
  return network === 'citrea-testnet' || network === 'citreaTestnet';
}

function getExplorerUrl(network, address) {
  const explorers = {
    mainnet: `https://etherscan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    base: `https://basescan.org/address/${address}`,
    baseSepolia: `https://sepolia.basescan.org/address/${address}`,
    citreaTestnet: `https://explorer.testnet.citrea.xyz/address/${address}`,
  };
  return explorers[network] || `https://explorer.unknown.network/address/${address}`;
}

function isAlreadyVerified(error) {
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("Already Verified") ||
    errorMessage.includes("already verified") ||
    errorMessage.includes("Contract source code already verified")
  );
}

module.exports = {
  isBlockscoutNetwork,
  getExplorerUrl,
  isAlreadyVerified,
};

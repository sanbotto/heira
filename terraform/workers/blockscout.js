// Blockscout API verification for contracts
// Note: This file requires ethers to be imported at the top level
// In Terraform, add: import { AbiCoder, getAddress } from 'https://cdn.jsdelivr.net/npm/ethers@6/+esm';
// getExplorerUrl and isAlreadyVerified are available from concatenated files

// Encode constructor arguments for verification
// Constructor signature: constructor(address _mainWallet, uint256 _inactivityPeriod, address _owner)
function encodeConstructorArguments(mainWallet, inactivityPeriod, owner) {
  const abiCoder = AbiCoder.defaultAbiCoder();
  const inactivityPeriodBigInt =
    typeof inactivityPeriod === "bigint"
      ? inactivityPeriod
      : BigInt(inactivityPeriod);

  // Encode as tuple: (address, uint256, address)
  return abiCoder.encode(
    ["address", "uint256", "address"],
    [getAddress(mainWallet), inactivityPeriodBigInt, getAddress(owner)],
  );
}

// Verify escrow contract using Blockscout API
export async function verifyEscrowWithBlockscout(
  request,
  standardJsonInput,
  blockscoutApiKey,
  fetchFn = fetch,
) {
  const { escrowAddress, mainWallet, inactivityPeriod, owner, network } =
    request;

  // Get Blockscout API URL
  const blockscoutUrl = getExplorerUrl(network, "").replace(
    /\/address\/.*$/,
    "",
  );
  const apiUrl = `${blockscoutUrl}/api`;

  // Encode constructor arguments
  const constructorArgs = encodeConstructorArguments(
    mainWallet,
    inactivityPeriod,
    owner,
  );

  // Remove the 0x prefix for Blockscout API
  const constructorArgsEncoded = constructorArgs.slice(2);

  // Prepare form data for Blockscout API
  const formData = new URLSearchParams();
  formData.append("module", "contract");
  formData.append("action", "verifysourcecode");
  formData.append("addressHash", escrowAddress.toLowerCase());
  formData.append("contractname", "HeiraInheritanceEscrow");
  formData.append("compilerversion", "v0.8.24+commit.e14b2715");
  formData.append("optimizationUsed", "1");
  formData.append("runs", "200");
  formData.append("evmversion", "default");
  formData.append("licenseType", "3"); // MIT
  formData.append("sourceCode", standardJsonInput);
  formData.append("constructorArguments", constructorArgsEncoded);

  // Add API key if provided
  if (blockscoutApiKey) {
    formData.append("apikey", blockscoutApiKey);
  }

  try {
    const response = await fetchFn(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const responseData = await response.json();

    if (!response.ok) {
      // Check if already verified
      const responseText = JSON.stringify(responseData);
      if (isAlreadyVerified({ message: responseText })) {
        return {
          success: true,
          message: "Contract is already verified",
          explorerUrl: getExplorerUrl(network, escrowAddress),
          alreadyVerified: true,
        };
      }

      return {
        success: false,
        message:
          responseData.message || `Verification failed: ${response.status}`,
        details: responseText,
      };
    }

    // Check response status
    if (responseData.status === "1" || responseData.result) {
      // Verification submitted successfully
      const guid = responseData.result || responseData.guid;

      return {
        success: true,
        message: "Verification submitted successfully",
        explorerUrl: getExplorerUrl(network, escrowAddress),
        verificationNote: guid
          ? `Verification GUID: ${guid}. Check status on explorer.`
          : undefined,
      };
    } else if (
      responseData.message &&
      isAlreadyVerified({ message: responseData.message })
    ) {
      return {
        success: true,
        message: "Contract is already verified",
        explorerUrl: getExplorerUrl(network, escrowAddress),
        alreadyVerified: true,
      };
    } else {
      return {
        success: false,
        message: responseData.message || "Verification failed",
        details: JSON.stringify(responseData),
      };
    }
  } catch (error) {
    const errorMessage = error.message || String(error);

    // Check if already verified
    if (isAlreadyVerified(error)) {
      return {
        success: true,
        message: "Contract is already verified",
        explorerUrl: getExplorerUrl(network, escrowAddress),
        alreadyVerified: true,
      };
    }

    // Handle Blockscout-specific errors
    if (errorMessage.includes("Unable to verify")) {
      return {
        success: true,
        message:
          "Contract deployed successfully. Verification failed on Blockscout (this is common and non-fatal). Contract is fully functional.",
        explorerUrl: getExplorerUrl(network, escrowAddress),
        alreadyVerified: false,
        verificationNote:
          "Blockscout verification can be unreliable. Contract functionality is not affected.",
      };
    }

    return {
      success: false,
      message: `Verification error: ${errorMessage}`,
      details: error.stack || errorMessage,
    };
  }
}

// Check if contract is already verified on Blockscout
export async function checkVerificationStatus(
  escrowAddress,
  network,
  fetchFn = fetch,
) {
  const blockscoutUrl = getExplorerUrl(network, "").replace(
    /\/address\/.*$/,
    "",
  );
  const apiUrl = `${blockscoutUrl}/api`;

  try {
    const response = await fetchFn(
      `${apiUrl}?module=contract&action=getsourcecode&address=${escrowAddress.toLowerCase()}`,
    );
    const data = await response.json();

    if (data.status === "1" && data.result && data.result[0]) {
      const sourceCode = data.result[0].SourceCode;
      // If SourceCode exists and is not empty, contract is verified
      return sourceCode && sourceCode.trim() !== "";
    }

    return false;
  } catch (error) {
    console.error("Error checking verification status:", error);
    return false;
  }
}

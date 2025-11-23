import { Router } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const verifyEscrowRouter = Router();

/**
 * API endpoint to verify escrow contracts automatically
 * POST /api/verify-escrow
 *
 * Body:
 * {
 *   escrowAddress: string,
 *   mainWallet: string,
 *   inactivityPeriod: string | number,
 *   owner: string,
 *   network: string (e.g., 'sepolia', 'baseSepolia')
 * }
 */
verifyEscrowRouter.post("/", async (req, res) => {
  try {
    const { escrowAddress, mainWallet, inactivityPeriod, owner, network } =
      req.body;

    // Validate required fields
    if (
      !escrowAddress ||
      !mainWallet ||
      inactivityPeriod === undefined ||
      !owner ||
      !network
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: escrowAddress, mainWallet, inactivityPeriod, owner, network",
      });
    }

    // Validate network
    const validNetworks = ["sepolia", "baseSepolia", "mainnet", "base"];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({
        success: false,
        message: `Invalid network. Must be one of: ${validNetworks.join(", ")}`,
      });
    }

    // Get the contracts directory path
    // Backend is in backend/, contracts are in ../contracts relative to backend/
    const contractsDir = path.resolve(__dirname, "..", "..", "..", "contracts");

    // Check if contracts directory exists
    const fs = await import("fs");
    if (!fs.existsSync(contractsDir)) {
      console.error(`Contracts directory not found: ${contractsDir}`);
      return res.status(500).json({
        success: false,
        message: `Contracts directory not found at ${contractsDir}. Make sure the contracts folder exists.`,
      });
    }

    // Build the command to run the verification script
    // Escape special characters in addresses to prevent shell injection
    const escapeShell = (str: string) => `"${str.replace(/"/g, '\\"')}"`;

    const envVars = [
      `CONTRACT_ADDRESS=${escapeShell(escrowAddress)}`,
      `MAIN_WALLET=${escapeShell(mainWallet)}`,
      `INACTIVITY_PERIOD=${inactivityPeriod}`,
      `OWNER=${escapeShell(owner)}`,
    ].join(" ");

    const cleanCommand = `cd ${contractsDir} && npx hardhat clean`;
    const compileCommand = `cd ${contractsDir} && npx hardhat compile`;
    const command = `cd ${contractsDir} && ${envVars} npx hardhat run scripts/verify-escrow.js --network ${network}`;

    console.log(
      `Executing verification command: ${command.replace(/ETHERSCAN_API_KEY=[^\s]+/, "ETHERSCAN_API_KEY=***")}`,
    );
    console.log(`Working directory: ${contractsDir}`);

    try {
      // Clean artifacts first
      console.log("Cleaning old artifacts...");
      try {
        await execAsync(cleanCommand, {
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 10,
          cwd: contractsDir,
        });
      } catch (cleanError: any) {
        console.warn("Clean warning (continuing anyway):", cleanError.message);
      }

      // Compile contracts
      console.log("Compiling contracts...");
      try {
        await execAsync(compileCommand, {
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10,
          cwd: contractsDir,
        });
        console.log("Compilation successful");
      } catch (compileError: any) {
        const compileOutput =
          (compileError.stdout || "") + (compileError.stderr || "");
        // Only fail if there are actual errors (not just warnings)
        if (
          compileOutput.toLowerCase().includes("error") &&
          !compileOutput.toLowerCase().includes("warning")
        ) {
          console.error("Compilation failed:", compileOutput);
          return res.status(500).json({
            success: false,
            message: "Compilation failed before verification.",
            details: compileOutput,
          });
        }
        console.warn("Compilation completed with warnings, continuing...");
      }

      // Small delay to ensure file system is synced
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("Running verification script...");
      const { stdout, stderr } = await execAsync(command, {
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 10,
        cwd: contractsDir,
        env: {
          ...process.env,
          CONTRACT_ADDRESS: escrowAddress,
          MAIN_WALLET: mainWallet,
          INACTIVITY_PERIOD: inactivityPeriod.toString(),
          OWNER: owner,
        },
      });

      console.log("Verification stdout:", stdout);
      if (stderr) console.log("Verification stderr:", stderr);

      // If execAsync didn't throw, verification succeeded (exit code 0)
      // Extract explorer URL if present
      const output = stdout + stderr;
      const explorerUrlMatch = output.match(
        /View on explorer: (https?:\/\/[^\s]+)/i,
      );
      const explorerUrl = explorerUrlMatch ? explorerUrlMatch[1] : undefined;

      // Check if output indicates already verified (informational, not an error)
      const isAlreadyVerified = output
        .toLowerCase()
        .includes("already verified");

      return res.json({
        success: true,
        message: isAlreadyVerified
          ? "Contract is already verified"
          : "Contract verified successfully",
        explorerUrl,
        alreadyVerified: isAlreadyVerified,
      });
    } catch (execError: any) {
      const errorOutput = (execError.stdout || "") + (execError.stderr || "");
      console.error("Verification error:", execError.message);
      console.error("Error output:", errorOutput);

      // If the script exited with code 0 but there's output about "already verified", treat as success
      // The verify script handles "already verified" cases and exits successfully
      if (
        execError.code === 0 ||
        errorOutput.toLowerCase().includes("already verified")
      ) {
        const explorerUrlMatch = errorOutput.match(
          /View on explorer: (https?:\/\/[^\s]+)/i,
        );
        const explorerUrl = explorerUrlMatch ? explorerUrlMatch[1] : undefined;

        return res.json({
          success: true,
          message: "Contract is already verified",
          explorerUrl,
          alreadyVerified: true,
        });
      }

      // Only return error if it's a real failure (non-zero exit code and not "already verified")
      // Extract error message
      let errorMessage = "Verification failed";
      if (
        errorOutput.includes("bytecode") &&
        errorOutput.includes("doesn't match")
      ) {
        errorMessage =
          "Bytecode mismatch: The deployed contract bytecode does not match the compiled contract. Please ensure compiler settings match exactly.";
      } else if (errorOutput) {
        // Try to extract a meaningful error message
        const errorMatch = errorOutput.match(/Error:?\s*(.+?)(?:\n|$)/i);
        if (errorMatch) {
          errorMessage = errorMatch[1].trim();
        } else {
          errorMessage = errorOutput.slice(0, 500);
        }
      } else if (execError.message) {
        errorMessage = execError.message;
      }

      return res.status(500).json({
        success: false,
        message: errorMessage,
        details: errorOutput || execError.message,
      });
    }
  } catch (error: any) {
    console.error("Verification API error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message,
    });
  }
});

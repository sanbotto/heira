// Email service for sending inactivity warnings
// Compatible with both Workers and Node.js environments

// Get explorer URL for an escrow address based on network
function getExplorerUrlForEmail(escrowAddress, network) {
  const address = escrowAddress.toLowerCase();

  switch (network.toLowerCase()) {
    case "eth-mainnet":
    case "mainnet":
      return `https://eth.blockscout.com/address/${address}`;
    case "eth-sepolia":
    case "sepolia":
      return `https://eth-sepolia.blockscout.com/address/${address}`;
    case "base-mainnet":
    case "base":
      return `https://base.blockscout.com/address/${address}`;
    case "base-sepolia":
    case "baseSepolia":
      return `https://base-sepolia.blockscout.com/address/${address}`;
    case "citrea-testnet":
    case "citreaTestnet":
      return `https://explorer.testnet.citrea.xyz/address/${address}`;
    default:
      return `https://${network}.blockscout.com/address/${address}`;
  }
}

// Send inactivity warning email via MailPace
export async function sendInactivityWarning(
  params,
  fetchFn = fetch,
  mailpaceApiToken,
  mailpaceFromEmail,
) {
  const fromEmail = mailpaceFromEmail || "noreply@heira.app";

  if (!mailpaceApiToken) {
    throw new Error("MAILPACE_API_TOKEN not configured");
  }

  const { to, escrowAddress, network, daysRemaining, explorerUrl } = params;

  // Format days remaining
  const daysText =
    daysRemaining === 1 ? "1 day" : `${Math.ceil(daysRemaining)} days`;

  // Generate explorer URL if not provided
  const explorerLink = explorerUrl || getExplorerUrlForEmail(escrowAddress, network);

  // Email subject
  const subject = `Heira Escrow: Inactivity Period Approaching`;

  // Email body (plain text)
  const textBody = `Your Heira escrow contract is approaching its inactivity period.

Escrow Address: ${escrowAddress}
Network: ${network}
Time Remaining: ${daysText}

Your escrow will be executed if there is no activity on the monitored wallet within ${daysText}.

View your escrow: ${explorerLink}

If you want to prevent execution, please ensure there is activity on the monitored wallet or deactivate the escrow contract.

This is an automated notification from Heira.`;

  // HTML body
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FED80E; color: #333; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
    .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #FED80E; border-radius: 4px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #FED80E; color: #333; text-decoration: none; border-radius: 5px; margin-top: 15px; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Heira Escrow Notification</h1>
    </div>
    <div class="content">
      <p>Your Heira escrow contract is approaching its inactivity period.</p>
      
      <div class="info-box">
        <strong>Escrow Address:</strong> ${escrowAddress}<br>
        <strong>Network:</strong> ${network}<br>
        <strong>Time Remaining:</strong> less than ${daysText}
      </div>

      <p>Your escrow will be executed if there is no activity on the monitored wallet within <strong>${daysText}</strong>.</p>

      <a href="${explorerLink}" class="button">View Escrow</a>

      <p style="margin-top: 20px;">
        <strong>What you can do:</strong>
      </p>
      <ul>
        <li>Ensure there is activity on the monitored wallet to reset the timer</li>
        <li>Deactivate the escrow contract if you no longer need it</li>
      </ul>

      <div class="footer">
        <p>This is an automated notification from Heira.</p>
        <p>If you have questions, please contact support.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Prepare request
  const requestBody = {
    from: fromEmail,
    to: to,
    subject: subject,
    textbody: textBody,
    htmlbody: htmlBody,
  };

  // Send email via MailPace API
  const response = await fetchFn("https://app.mailpace.com/api/v1/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "MailPace-Server-Token": mailpaceApiToken,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `MailPace API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  await response.json();
  console.log(`Email sent successfully to ${to} for escrow ${escrowAddress}`);
}

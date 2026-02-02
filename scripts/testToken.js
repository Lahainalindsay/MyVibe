/* eslint-disable no-console */
const hre = require("hardhat");

function parseArgs(argv) {
  const args = { address: undefined, transfer: "1000" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--address" && argv[i + 1]) {
      args.address = argv[++i];
    } else if (a === "--transfer" && argv[i + 1]) {
      args.transfer = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const tokenAddr = args.address || process.env.VIBE_ADDRESS;
  if (!tokenAddr) throw new Error("Missing token address. Provide --address or set VIBE_ADDRESS in .env");

  const [owner, user] = await hre.ethers.getSigners();
  if (!owner || !user) throw new Error("Need at least two signers");

  const token = await hre.ethers.getContractAt("VibeToken", tokenAddr, owner);

  const [name, symbol, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.totalSupply(),
  ]);

  console.log("Token:", tokenAddr);
  console.log("name:", name, "symbol:", symbol);
  console.log("totalSupply:", hre.ethers.formatUnits(totalSupply, 18));

  const ownerBal = await token.balanceOf(owner.address);
  console.log("owner balance:", hre.ethers.formatUnits(ownerBal, 18));

  const transferAmount = hre.ethers.parseUnits(args.transfer, 18);
  console.log(`\nTransferring ${args.transfer} ${symbol} to`, user.address);
  const tx = await token.transfer(user.address, transferAmount);
  const rc = await tx.wait();
  console.log("tx:", rc.hash);

  const [ownerBalAfter, userBalAfter] = await Promise.all([
    token.balanceOf(owner.address),
    token.balanceOf(user.address),
  ]);
  console.log("owner balance after:", hre.ethers.formatUnits(ownerBalAfter, 18));
  console.log("user balance after:", hre.ethers.formatUnits(userBalAfter, 18));

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * Usage:
 *   export VIBE_TOKEN=0x...
 *   npx hardhat run scripts/readFeeExclusions.js --network localhost
 */
require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const token = process.env.VIBE_TOKEN;
  if (!token) throw new Error("Missing VIBE_TOKEN");
  const vibe = await hre.ethers.getContractAt("VibeToken", token);

  const signers = await hre.ethers.getSigners();
  const dao = await vibe.daoWallet();

  const addrs = [
    ["token", vibe.target],
    ["dao", dao],
    ...signers.slice(0, 6).map((s, i) => [`signer${i}`, s.address]),
  ];

  for (const [label, addr] of addrs) {
    const ex = await vibe.excludedFromFees(addr);
    console.log(label, addr, "excludedFromFees=", ex);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

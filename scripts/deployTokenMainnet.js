/* eslint-disable no-console */
const hre = require("hardhat");

function env(name) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

function envAddress(name) {
  const v = env(name);
  if (!v) return undefined;
  return hre.ethers.isAddress(v) ? v : undefined;
}

async function main() {
  const [deployer, ...rest] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available. Check PRIVATE_KEY in .env");

  const deployerAddr = await deployer.getAddress();
  console.log("🚀 Deployer:", deployerAddr);

  // Use deployer for all constructor args unless provided via env.
  const dao = envAddress("DAO_ADDRESS") || deployerAddr;
  const staking = envAddress("STAKING_ADDRESS") || (rest[0] && (await rest[0].getAddress())) || deployerAddr;
  const fairLaunch = envAddress("FAIRLAUNCH_ADDRESS") || (rest[1] && (await rest[1].getAddress())) || deployerAddr;
  const influencer = envAddress("INFLUENCER_ADDRESS") || (rest[2] && (await rest[2].getAddress())) || deployerAddr;

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(dao, staking, fairLaunch, influencer);
  await vibe.deployed?.();
  const vibeAddr = (await vibe.getAddress?.()) || vibe.address;

  console.log("✅ VibeToken:", vibeAddr);
  console.log("\nNote: trading is disabled by default. Enable later with enableTrading()." );
  console.log("VIBE_ADDRESS=", vibeAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

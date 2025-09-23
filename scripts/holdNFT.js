/* eslint-disable no-console */
const hre = require("hardhat");

function env(name, def) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : def;
}

async function main() {
  const wyv = env("WYV_ADDRESS");
  const soulAddr = wyv || env("SOUL_ADDRESS");
  if (!soulAddr) throw new Error("WYV_ADDRESS or SOUL_ADDRESS not set in environment");

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer available. Check PRIVATE_KEY in .env");
  const from = await signer.getAddress();
  console.log("Network:", hre.network.name);
  console.log("From:", from);
  console.log("NFT:", soulAddr, wyv ? "(VYX)" : "(SoulArcana)");

  const soul = await hre.ethers.getContractAt(wyv ? "WhatsYourVibeNFT" : "SoulArcanaNFT", soulAddr, signer);

  // Set extremely high prices to effectively pause public mint
  const ethPrice = env("HOLD_ETH_PRICE", "1000"); // in ETH
  const vibePrice = env("HOLD_VIBE_PRICE", "1000000000000000"); // in VIBE units (1e18)

  const tx = await soul.setPrices(
    hre.ethers.parseEther(String(ethPrice)),
    hre.ethers.parseUnits(String(vibePrice), 18)
  );
  console.log("setPrices tx:", tx.hash);
  await tx.wait();
  console.log("mintPriceETH:", (await soul.mintPriceETH()).toString());
  console.log("mintPriceVIBE:", (await soul.mintPriceVIBE()).toString());

  // Optional: restrict per-tx mint if requested
  const setMax = env("HOLD_SET_MAX_PER_TX_ONE", "false") === "true";
  if (setMax) {
    const tx2 = await soul.setMaxMintPerTx(1);
    console.log("setMaxMintPerTx(1) tx:", tx2.hash);
    await tx2.wait();
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

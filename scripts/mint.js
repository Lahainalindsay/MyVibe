/* eslint-disable no-console */
const hre = require("hardhat");

function env(name, fallback) {
  const v = process.env[name];
  if (v && v.trim().length) return v.trim();
  return fallback;
}

async function main() {
  const vibeAddress = env("VIBE_ADDRESS");
  const vyxAddress = env("VYX_ADDRESS");
  const wyvAddress = env("WYV_ADDRESS");
  const soulAddress = vyxAddress || wyvAddress || env("SOUL_ADDRESS");
  const qtyEnv = env("QTY", "1");
  const qty = BigInt(qtyEnv);

  if (!vibeAddress || !soulAddress) {
    throw new Error("Set VIBE_ADDRESS and SOUL_ADDRESS in env.");
  }

  // Resolve signer: prefer MINTER_PRIVATE_KEY if provided, otherwise use first configured signer
  let signer;
  if (env("MINTER_PRIVATE_KEY")) {
    signer = new hre.ethers.Wallet(env("MINTER_PRIVATE_KEY"), hre.ethers.provider);
  } else {
    [signer] = await hre.ethers.getSigners();
  }

  const me = await signer.getAddress();
  console.log("Minter:", me);
  console.log("VIBE:", vibeAddress);
  console.log("SOUL:", soulAddress);
  console.log("QTY:", qty.toString());

  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddress, signer);
  const soul = await hre.ethers.getContractAt((vyxAddress || wyvAddress) ? "WhatsYourVibeNFT" : "SoulArcanaNFT", soulAddress, signer);

  const price = await soul.mintPriceVIBE();
  const cost = price * qty;
  const bal = await vibe.balanceOf(me);
  console.log("VIBE balance:", bal.toString());
  console.log("Mint price per NFT:", price.toString());
  console.log("Total cost:", cost.toString());

  if (bal < cost) {
    throw new Error("Insufficient VIBE balance to mint. Transfer VIBE to this account.");
  }

  const soulTarget = await soul.getAddress();
  const allowance = await vibe.allowance(me, soulTarget);
  if (allowance < cost) {
    console.log("Approving VIBE for SoulArcanaNFT...");
    const tx = await vibe.approve(soulTarget, cost);
    await tx.wait();
    console.log("Approved", cost.toString());
  } else {
    console.log("Sufficient allowance present.");
  }

  console.log("Minting...", qty.toString());
  const mintTx = await soul.mintWithVibe(qty);
  await mintTx.wait();
  const nftBal = await soul.balanceOf(me);
  console.log("Mint complete. NFT balance:", nftBal.toString());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

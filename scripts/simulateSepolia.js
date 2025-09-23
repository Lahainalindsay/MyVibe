/* eslint-disable no-console */
const hre = require("hardhat");

function env(name, def) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : def;
}

function asBool(v, def = false) {
  const s = env(v);
  if (s == null) return def;
  return ["1", "true", "yes", "on"].includes(String(s).toLowerCase());
}

async function ensureEth(sender, recipient, minEthWei) {
  const bal = await sender.provider.getBalance(recipient);
  if (bal >= minEthWei) return false;
  const topUpWei = minEthWei - bal;
  const tx = await sender.sendTransaction({ to: recipient, value: topUpWei });
  await tx.wait();
  console.log(`Topped up ETH for ${recipient}: +${hre.ethers.formatEther(topUpWei)} ETH`);
  return true;
}

async function ensureVibe(vibe, sender, recipient, minVibeWei) {
  const bal = await vibe.balanceOf(recipient);
  if (bal >= minVibeWei) return false;
  const topUp = minVibeWei - bal;
  const tx = await vibe.connect(sender).transfer(recipient, topUp);
  await tx.wait();
  console.log(`Transferred VIBE to ${recipient}: +${hre.ethers.formatUnits(topUp, 18)} VIBE`);
  return true;
}

async function main() {
  const vibeAddr = env("VIBE_ADDRESS");
  if (!vibeAddr) throw new Error("VIBE_ADDRESS not set in environment");

  const wyvAddr = env("WYV_ADDRESS");
  const soulAddr = wyvAddr || env("SOUL_ADDRESS");
  const stakingAddr = env("STAKING_ADDRESS");

  // Signers: primary from Hardhat config (PRIVATE_KEY), plus optional env keys for wallet2/3
  const [primary] = await hre.ethers.getSigners();
  if (!primary) throw new Error("No signer available. Check PRIVATE_KEY in .env");
  const primaryAddr = await primary.getAddress();

  const w2Key = env("WALLET2_PRIVATE_KEY");
  const w3Key = env("WALLET3_PRIVATE_KEY");
  const wallet2 = w2Key ? new hre.ethers.Wallet(w2Key, hre.ethers.provider) : null;
  const wallet3 = w3Key ? new hre.ethers.Wallet(w3Key, hre.ethers.provider) : null;
  const w2Addr = wallet2 ? await wallet2.getAddress() : undefined;
  const w3Addr = wallet3 ? await wallet3.getAddress() : undefined;

  console.log("Network:", hre.network.name);
  console.log("Primary:", primaryAddr);
  if (wallet2) console.log("Wallet2:", w2Addr);
  if (wallet3) console.log("Wallet3:", w3Addr);
  console.log("VibeToken:", vibeAddr);
  if (soulAddr) console.log("NFT:", soulAddr, wyvAddr ? "(VYX)" : "(SoulArcana)");
  if (stakingAddr) console.log("Staking address (for approve):", stakingAddr);

  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddr, primary);
  const soul = soulAddr ? await hre.ethers.getContractAt(wyvAddr ? "WhatsYourVibeNFT" : "SoulArcanaNFT", soulAddr, primary) : null;

  // Optionally enable trading
  if (asBool("SIM_ENABLE_TRADING")) {
    const enabled = await vibe.tradingEnabled();
    if (!enabled) {
      const tx = await vibe.setTradingEnabled(true);
      console.log("setTradingEnabled tx:", tx.hash);
      await tx.wait();
    } else {
      console.log("Trading already enabled");
    }
  }

  // Optional funding: ensure each wallet has gas and some VIBE
  const wantTopUpEth = env("SIM_TOPUP_ETH", "0"); // e.g. "0.02"
  const wantTopUpVibe = env("SIM_TOPUP_VIBE", "0"); // e.g. "5000"
  const minEthWei = hre.ethers.parseEther(wantTopUpEth || "0");
  const minVibeWei = hre.ethers.parseUnits(wantTopUpVibe || "0", 18);

  if (wallet2 && (minEthWei > 0n || minVibeWei > 0n)) {
    if (minEthWei > 0n) await ensureEth(primary, w2Addr, minEthWei);
    if (minVibeWei > 0n) await ensureVibe(vibe, primary, w2Addr, minVibeWei);
  }
  if (wallet3 && (minEthWei > 0n || minVibeWei > 0n)) {
    if (minEthWei > 0n) await ensureEth(primary, w3Addr, minEthWei);
    if (minVibeWei > 0n) await ensureVibe(vibe, primary, w3Addr, minVibeWei);
  }

  // Transfers between wallets to simulate usage
  const transferAmtStr = env("SIM_VIBE_TRANSFER_AMOUNT", "0"); // e.g. "1000"
  if (wallet2 && transferAmtStr && Number(transferAmtStr) > 0) {
    const amt = hre.ethers.parseUnits(String(transferAmtStr), 18);
    // primary -> wallet2
    const t1 = await vibe.transfer(w2Addr, amt);
    await t1.wait();
    console.log(`Transfer primary -> wallet2: ${transferAmtStr} VIBE (tx: ${t1.hash})`);

    if (wallet3) {
      // wallet2 -> wallet3
      const t2 = await vibe.connect(wallet2).transfer(w3Addr, amt / 2n);
      await t2.wait();
      console.log(`Transfer wallet2 -> wallet3: ${Number(transferAmtStr)/2} VIBE (tx: ${t2.hash})`);
    }
  }

  // Approve staking for each wallet
  const approveAmtStr = env("SIM_APPROVE_AMOUNT", "0"); // e.g. "10000"
  if (stakingAddr && approveAmtStr && Number(approveAmtStr) > 0) {
    const approveWei = hre.ethers.parseUnits(String(approveAmtStr), 18);
    const a1 = await vibe.approve(stakingAddr, approveWei);
    await a1.wait();
    console.log(`Primary approve ${approveAmtStr} VIBE -> ${stakingAddr} (tx: ${a1.hash})`);
    if (wallet2) {
      const a2 = await vibe.connect(wallet2).approve(stakingAddr, approveWei);
      await a2.wait();
      console.log(`Wallet2 approve ${approveAmtStr} VIBE -> ${stakingAddr} (tx: ${a2.hash})`);
    }
    if (wallet3) {
      const a3 = await vibe.connect(wallet3).approve(stakingAddr, approveWei);
      await a3.wait();
      console.log(`Wallet3 approve ${approveAmtStr} VIBE -> ${stakingAddr} (tx: ${a3.hash})`);
    }
  }

  // Mint NFTs (ETH or VIBE) from wallet2 by default if requested
  const doMintEth = asBool("SIM_MINT_ETH");
  const doMintVibe = asBool("SIM_MINT_VIBE");
  const qty = BigInt(env("SIM_QTY", "1"));
  if ((doMintEth || doMintVibe) && !soul) {
    throw new Error("SOUL_ADDRESS required for mint simulation");
  }
  if (wallet2 && (doMintEth || doMintVibe)) {
    // ensure gas for wallet2
    await ensureEth(primary, w2Addr, hre.ethers.parseEther("0.01"));
    if (doMintEth) {
      const price = await soul.mintPriceETH();
      const total = price * qty;
      const tx = await soul.connect(wallet2).mint(qty, { value: total });
      const rc = await tx.wait();
      console.log(`Minted ${qty} with ETH from wallet2 (tx: ${rc.hash})`);
    }
    if (doMintVibe) {
      const price = await soul.mintPriceVIBE();
      const total = price * qty;
      await ensureVibe(vibe, primary, w2Addr, total);
      await (await vibe.connect(wallet2).approve(await soul.getAddress(), total)).wait();
      const tx = await soul.connect(wallet2).mintWithVibe(qty);
      const rc = await tx.wait();
      console.log(`Minted ${qty} with VIBE from wallet2 (tx: ${rc.hash})`);
    }
  }

  // Summary balances
  const [balP, balW2, balW3] = await Promise.all([
    vibe.balanceOf(primaryAddr),
    w2Addr ? vibe.balanceOf(w2Addr) : Promise.resolve(0n),
    w3Addr ? vibe.balanceOf(w3Addr) : Promise.resolve(0n),
  ]);
  console.log("Balances (VIBE):", {
    primary: hre.ethers.formatUnits(balP, 18),
    wallet2: w2Addr ? hre.ethers.formatUnits(balW2, 18) : undefined,
    wallet3: w3Addr ? hre.ethers.formatUnits(balW3, 18) : undefined,
  });

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

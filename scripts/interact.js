/* eslint-disable no-console */
const hre = require("hardhat");

function parseArgs(argv) {
  const args = { mint: undefined, qty: 1n };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mint" && argv[i + 1]) {
      args.mint = String(argv[++i]).toLowerCase(); // "eth" | "vibe"
    } else if (a === "--qty" && argv[i + 1]) {
      args.qty = BigInt(argv[++i]);
    } else if (a === "--owner" && argv[i + 1]) {
      args.owner = argv[++i];
    } else if (a === "--skip-mint") {
      args.mint = "none";
    }
  }
  return args;
}

function decodeDataUri(uri) {
  try {
    const parts = String(uri).split(",");
    const b64 = parts.length > 1 ? parts[1] : parts[0];
    const json = Buffer.from(b64, "base64").toString("utf8");
    return json;
  } catch (e) {
    return `Unable to decode tokenURI: ${e.message}`;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer available. Check PRIVATE_KEY in .env");
  const from = await signer.getAddress();

  const vibeAddr = process.env.VIBE_ADDRESS;
  const soulAddr = process.env.SOUL_ADDRESS;
  if (!vibeAddr || !soulAddr) {
    throw new Error("Missing VIBE_ADDRESS or SOUL_ADDRESS in environment.");
  }

  console.log("Network:", hre.network.name);
  console.log("From:", from);
  console.log("VibeToken:", vibeAddr);
  console.log("SoulArcanaNFT:", soulAddr);

  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddr, signer);
  const soul = await hre.ethers.getContractAt("SoulArcanaNFT", soulAddr, signer);

  // ----- Read token basics -----
  const [name, symbol] = await Promise.all([vibe.name(), vibe.symbol()]);
  const total = await vibe.totalSupply();
  const totalFmt = hre.ethers.formatUnits(total, 18);
  const [burn, dao, reflect] = await Promise.all([
    vibe.burnRate(),
    vibe.daoRate(),
    vibe.reflectRate(),
  ]);
  const [maxTx, maxWallet] = await Promise.all([
    vibe.maxTxAmount(),
    vibe.maxWalletAmount(),
  ]);
  let tradingEnabled;
  try { tradingEnabled = await vibe.tradingEnabled(); } catch { tradingEnabled = undefined; }

  console.log("\n=== VibeToken ===");
  console.log("name:", name, "symbol:", symbol);
  console.log("totalSupply:", totalFmt);
  console.log("fees (bps):", {
    burn: burn.toString(),
    dao: dao.toString(),
    reflect: reflect.toString(),
  });
  console.log("limits:", {
    maxTx: maxTx.toString(),
    maxWallet: maxWallet.toString(),
    tradingEnabled,
  });

  // ----- NFT pricing -----
  const [priceETH, priceVIBE] = await Promise.all([
    soul.mintPriceETH(),
    soul.mintPriceVIBE(),
  ]);
  console.log("\n=== SoulArcanaNFT ===");
  console.log("mintPriceETH:", priceETH.toString());
  console.log("mintPriceVIBE:", priceVIBE.toString());

  // ----- Optional mint flow -----
  const qty = args.qty || 1n;
  if (args.mint === "eth") {
    console.log(`\nMinting ${qty} NFT(s) with ETH...`);
    const totalCost = priceETH * qty;
    const tx = await soul.mint(qty, { value: totalCost });
    const rc = await tx.wait();
    console.log("ETH mint tx:", rc.hash);
  } else if (args.mint === "vibe") {
    console.log(`\nMinting ${qty} NFT(s) with VIBE...`);
    const totalCost = priceVIBE * qty;
    await (await vibe.approve(soulAddr, totalCost)).wait();
    const tx = await soul.mintWithVibe(qty);
    const rc = await tx.wait();
    console.log("VIBE mint tx:", rc.hash);
  } else {
    console.log("\nSkipping mint (use --mint eth|vibe to mint)");
  }

  // ----- Discover latest token for owner & print metadata -----
  try {
    const owner = args.owner || from;
    const balance = await soul.balanceOf(owner);
    if (balance > 0n) {
      const index = balance - 1n;
      const tokenId = await soul.tokenOfOwnerByIndex(owner, index);
      const uri = await soul.tokenURI(tokenId);
      const json = decodeDataUri(uri);
      console.log("\nLatest token for", owner);
      console.log("tokenId:", tokenId.toString());
      console.log("metadata:", json);
    } else {
      console.log("\nOwner holds no SoulArcanaNFT yet.");
    }
  } catch (e) {
    console.log("\nUnable to fetch token metadata:", e.message);
  }

  // ----- Dividends flow (best-effort) -----
  try {
    const owing = await vibe.dividendsOwing(from);
    console.log("\nDividends owing:", owing.toString());
    if (owing > 0n) {
      const tx = await vibe.claimDividends();
      const rc = await tx.wait();
      console.log("Dividends claimed:", rc.hash);
    }
  } catch {
    // ignore if not applicable
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


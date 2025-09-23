/* eslint-disable no-console */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function env(name, def) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : def;
}

function monthsToSeconds(m) { return BigInt(Math.floor((Number(m) || 0) * 30 * 24 * 60 * 60)); }

function nowSec() { return BigInt(Math.floor(Date.now() / 1000)); }

function readConfig() {
  const file = env("TOKENOMICS_CONFIG", "tokenomics.config.json");
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) throw new Error(`Tokenomics config not found: ${p}`);
  const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(cfg.allocations) || cfg.allocations.length === 0) {
    throw new Error("allocations array required in tokenomics config");
  }
  const totalPct = cfg.allocations.reduce((s, a) => s + Number(a.percent || 0), 0);
  if (totalPct !== 100) throw new Error(`allocations percent sum ${totalPct} != 100`);
  return cfg;
}

async function ensureVestingFactory() {
  // We deploy OZ VestingWallet directly from node_modules via fully-qualified name
  const fqName = "@openzeppelin/contracts/finance/VestingWallet.sol:VestingWallet";
  const VestingWallet = await hre.ethers.getContractFactory(fqName);
  return VestingWallet;
}

async function main() {
  const vibeAddr = env("VIBE_ADDRESS");
  if (!vibeAddr) throw new Error("VIBE_ADDRESS not set in env");
  const cfg = readConfig();

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer; check PRIVATE_KEY");
  const from = await signer.getAddress();
  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddr, signer);

  const decimals = BigInt(cfg.decimals || 18);
  const supplyUnits = hre.ethers.parseUnits(String(cfg.totalSupply), Number(decimals));
  const tokenSupply = await vibe.totalSupply();
  if (tokenSupply !== supplyUnits) {
    throw new Error(`On-chain totalSupply=${tokenSupply.toString()} does not match config=${supplyUnits.toString()}`);
  }

  const deployerBal = await vibe.balanceOf(from);
  if (deployerBal < supplyUnits) {
    console.warn(`Warning: deployer holds ${deployerBal.toString()} but config expects full supply at deployer. Proceeding.`);
  }

  const tgeTimestamp = BigInt(env("TGE_TIMESTAMP", String(Math.floor(Date.now() / 1000))));
  const dryRun = /^true$/i.test(String(env("DRY_RUN", "true")));
  const VestingWallet = await ensureVestingFactory();

  console.log("Network:", hre.network.name);
  console.log("From:", from);
  console.log("Token:", vibeAddr);
  console.log("Total supply:", hre.ethers.formatUnits(tokenSupply, Number(decimals)));
  console.log("TGE timestamp:", tgeTimestamp.toString());

  const actions = [];

  for (const a of cfg.allocations) {
    const pct = Number(a.percent);
    const name = a.name || "Unnamed";
    const beneficiary = a.beneficiary;
    if (!beneficiary) throw new Error(`beneficiary missing for ${name}`);

    const amount = (supplyUnits * BigInt(Math.round(pct * 100))) / 10000n; // 2 decimals precision
    const vest = a.vesting || { tgePercent: 100, cliffMonths: 0, durationMonths: 0 };
    const tgePct = Number(vest.tgePercent || 0);
    if (tgePct < 0 || tgePct > 100) throw new Error(`tgePercent out of range for ${name}`);

    const tgeAmount = (amount * BigInt(Math.round(tgePct * 100))) / 10000n;
    const vestAmount = amount - tgeAmount;

    let vestingAddr = undefined;
    if (vestAmount > 0n) {
      const cliff = monthsToSeconds(vest.cliffMonths || 0);
      const duration = monthsToSeconds(vest.durationMonths || 0);
      const start = tgeTimestamp + cliff;
      if (!dryRun) {
        const vesting = await VestingWallet.deploy(beneficiary, start, duration);
        await vesting.waitForDeployment();
        vestingAddr = await vesting.getAddress();
      }
    }

    actions.push({ name, beneficiary, amount, tgeAmount, vestAmount, vestingAddr });
  }

  // Preview
  console.log("Planned distribution:");
  for (const x of actions) {
    console.log(` - ${x.name}: total ${hre.ethers.formatUnits(x.amount, Number(decimals))} | TGE ${hre.ethers.formatUnits(x.tgeAmount, Number(decimals))} | Vest ${hre.ethers.formatUnits(x.vestAmount, Number(decimals))} ${x.vestingAddr ? `-> ${x.vestingAddr}` : ""}`);
  }

  if (dryRun) {
    console.log("DRY_RUN=true: not transferring or deploying vesting wallets.");
    return;
  }

  // Execute transfers
  for (const x of actions) {
    if (x.tgeAmount > 0n) {
      const tx = await vibe.transfer(x.beneficiary, x.tgeAmount);
      console.log(`TGE -> ${x.name} (${x.beneficiary}) tx:`, tx.hash);
      await tx.wait();
    }
    if (x.vestAmount > 0n) {
      if (!x.vestingAddr) throw new Error(`vestingAddr missing for ${x.name}`);
      const tx = await vibe.transfer(x.vestingAddr, x.vestAmount);
      console.log(`VEST -> ${x.name} (${x.vestingAddr}) tx:`, tx.hash);
      await tx.wait();
    }
  }

  console.log("Distribution complete.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


/* eslint-disable no-console */
const hre = require("hardhat");

function env(name, def) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : def;
}

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
];

const V2_ROUTER_ABI = [
  "function factory() external view returns (address)",
  "function WETH() external view returns (address)",
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
];

const V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

async function approveIfNeeded(token, owner, spender, amount) {
  const current = await token.allowance(owner, spender);
  if (current >= amount) return false;
  const tx = await token.approve(spender, amount);
  console.log(`approve(${await token.symbol()} -> ${spender}) tx:`, tx.hash);
  await tx.wait();
  return true;
}

async function main() {
  const vibeAddr = env("VIBE_ADDRESS");
  const routerAddr = env("ROUTER_ADDRESS");
  const isEthPair = /^true$/i.test(String(env("IS_ETH_PAIR", "false")));
  const pairTokenAddr = isEthPair ? undefined : env("PAIR_TOKEN_ADDRESS");
  if (!vibeAddr || !routerAddr || (!isEthPair && !pairTokenAddr)) {
    throw new Error("Set VIBE_ADDRESS, ROUTER_ADDRESS and (PAIR_TOKEN_ADDRESS or IS_ETH_PAIR=true) in env");
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer available. Check PRIVATE_KEY in .env");
  const from = await signer.getAddress();

  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddr, signer);
  const router = new hre.ethers.Contract(routerAddr, V2_ROUTER_ABI, signer);

  const liqVibe = hre.ethers.parseUnits(env("LIQ_VIBE", "1000000"), 18);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(env("DEADLINE_SECONDS", "1800")));

  console.log("Network:", hre.network.name);
  console.log("From:", from);
  console.log("Router:", routerAddr);
  console.log("VIBE:", vibeAddr, "amount:", hre.ethers.formatUnits(liqVibe, 18));

  // Optional admin tweaks
  const exclRouter = /^true$/i.test(String(env("EXCLUDE_ROUTER", "true")));
  const exclPair = /^true$/i.test(String(env("EXCLUDE_PAIR", "true")));
  const enableTrading = /^true$/i.test(String(env("ENABLE_TRADING", "true")));
  if (enableTrading) {
    const en = await vibe.tradingEnabled();
    if (!en) {
      const tx = await vibe.setTradingEnabled(true);
      console.log("setTradingEnabled tx:", tx.hash);
      await tx.wait();
    }
  }
  if (exclRouter) {
    const tx1 = await vibe.setExcludedFromFees(routerAddr, true);
    await tx1.wait();
    const tx2 = await vibe.setExcludedFromLimits(routerAddr, true);
    await tx2.wait();
  }

  // Approve VIBE to router
  await approveIfNeeded(vibe, from, routerAddr, liqVibe);

  let pairToken;
  let amountBDesired = 0n;
  let decimalsB = 18;
  if (!isEthPair) {
    pairToken = new hre.ethers.Contract(pairTokenAddr, ERC20_ABI, signer);
    decimalsB = await pairToken.decimals();
    amountBDesired = hre.ethers.parseUnits(env("LIQ_PAIR", "100000"), decimalsB);
    console.log(`PAIR token: ${await pairToken.symbol()} ${pairTokenAddr} amount:`, hre.ethers.formatUnits(amountBDesired, decimalsB));
    await approveIfNeeded(pairToken, from, routerAddr, amountBDesired);
  } else {
    const ethAmt = env("LIQ_ETH", "100");
    amountBDesired = hre.ethers.parseEther(ethAmt);
    console.log("ETH amount:", hre.ethers.formatEther(amountBDesired));
  }

  // Add liquidity
  if (isEthPair) {
    const tx = await router.addLiquidityETH(
      vibeAddr,
      liqVibe,
      0,
      0,
      from,
      deadline,
      { value: amountBDesired }
    );
    console.log("addLiquidityETH tx:", tx.hash);
    await tx.wait();
  } else {
    const tx = await router.addLiquidity(
      vibeAddr,
      pairTokenAddr,
      liqVibe,
      amountBDesired,
      0,
      0,
      from,
      deadline
    );
    console.log("addLiquidity tx:", tx.hash);
    await tx.wait();
  }

  // Fetch pair and optionally exclude it
  const factoryAddr = await router.factory();
  const factory = new hre.ethers.Contract(factoryAddr, V2_FACTORY_ABI, signer);
  const tokenA = vibeAddr.toLowerCase();
  const tokenB = (isEthPair ? await router.WETH() : pairTokenAddr).toLowerCase();
  const pairAddr = await factory.getPair(tokenA, tokenB);
  console.log("Pair:", pairAddr);

  if (exclPair && pairAddr && pairAddr !== hre.ethers.ZeroAddress) {
    const t1 = await vibe.setExcludedFromFees(pairAddr, true);
    await t1.wait();
    const t2 = await vibe.setExcludedFromLimits(pairAddr, true);
    await t2.wait();
    console.log("Excluded pair from fees/limits");
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


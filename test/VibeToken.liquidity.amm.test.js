const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – AMM liquidity interactions (mock v2)", function () {
  let deployer, dao, staking, fairLaunch, influencer, lp, trader;
  let vibe, dai, pair;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, lp, trader] = await ethers.getSigners();

    const Vibe = await ethers.getContractFactory("VibeToken");
    const ctor = Vibe.interface.fragments.find((f) => f.type === "constructor");
    const argc = (ctor && ctor.inputs && ctor.inputs.length) || 0;
    if (argc >= 4) {
      vibe = await Vibe.deploy(dao.address, staking.address, fairLaunch.address, influencer.address);
    } else if (argc === 2) {
      vibe = await Vibe.deploy(dao.address, deployer.address);
    } else if (argc === 1) {
      vibe = await Vibe.deploy(dao.address);
    } else {
      vibe = await Vibe.deploy();
    }

    // Enable trading and relax limits for AMM flows
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // Mint/prepare paired token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Mock DAI", "mDAI", ethers.parseUnits("100000000", 18));

    // Provide LP/trader balances
    await vibe.transfer(lp.address, ethers.parseUnits("5000000", 18));
    await dai.transfer(lp.address, ethers.parseUnits("500000", 18));
    await vibe.transfer(trader.address, ethers.parseUnits("100000", 18));
    await dai.transfer(trader.address, ethers.parseUnits("10000", 18));

    const Pair = await ethers.getContractFactory("MockAMMPair");
    pair = await Pair.deploy(await vibe.getAddress(), await dai.getAddress());
  });

  it("adds liquidity and swaps VIBE->DAI with pair excluded from limits/fees", async () => {
    // Typical configuration: exclude pair from fees/limits
    await vibe.setExcludedFromFees(await pair.getAddress(), true);
    await vibe.setExcludedFromLimits(await pair.getAddress(), true);

    // LP approves and adds liquidity
    const amtV = ethers.parseUnits("1000000", 18);
    const amtD = ethers.parseUnits("100000", 18);
    await vibe.connect(lp).approve(await pair.getAddress(), amtV);
    await dai.connect(lp).approve(await pair.getAddress(), amtD);
    await expect(pair.connect(lp).addLiquidity(amtV, amtD))
      .to.emit(pair, "LiquidityAdded");

    const [rV0, rD0] = await pair.getReserves();
    expect(rV0).to.equal(amtV);
    expect(rD0).to.equal(amtD);

    // Trader swaps VIBE for DAI
    const inAmt = ethers.parseUnits("1000", 18);
    await vibe.connect(trader).approve(await pair.getAddress(), inAmt);
    await expect(pair.connect(trader).swap(await vibe.getAddress(), inAmt, trader.address))
      .to.emit(pair, "Swap");

    // Receives some DAI, VIBE balance decreases
    const balV = await vibe.balanceOf(trader.address);
    const balD = await dai.balanceOf(trader.address);
    expect(balV).to.be.lt(ethers.parseUnits("100000", 18));
    expect(balD).to.be.gt(ethers.parseUnits("10000", 18));
  });

  it("handles fee-on-transfer into pair by using balance delta for amountIn", async () => {
    // Do NOT exclude pair from fees to simulate fee-on-transfer into AMM
    // Add liquidity first from LP (exclude LP from fees for clean provisioning)
    await vibe.setExcludedFromFees(lp.address, true);

    const amtV = ethers.parseUnits("500000", 18);
    const amtD = ethers.parseUnits("50000", 18);
    await vibe.connect(lp).approve(await pair.getAddress(), amtV);
    await dai.connect(lp).approve(await pair.getAddress(), amtD);
    await pair.connect(lp).addLiquidity(amtV, amtD);

    // Now trader swaps with fees applied on transfer to pair
    await vibe.setExcludedFromFees(trader.address, false);
    const inAmt = ethers.parseUnits("2000", 18);
    await vibe.connect(trader).approve(await pair.getAddress(), inAmt);

    // Pair uses balance delta to determine actual amountIn received, so swap should succeed
    await expect(pair.connect(trader).swap(await vibe.getAddress(), inAmt, trader.address))
      .to.emit(pair, "Swap");

    // Trader received some DAI even though token takes a fee on transfer
    expect(await dai.balanceOf(trader.address)).to.be.gt(ethers.parseUnits("10000", 18));
  });
});

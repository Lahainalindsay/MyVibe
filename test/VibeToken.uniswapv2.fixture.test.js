const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – UniswapV2-like fixture", function () {
  let deployer, dao, staking, fairLaunch, influencer, lp, trader;
  let vibe, dai, factory, router, pair;

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

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    dai = await MockERC20.deploy("Mock DAI", "mDAI", ethers.parseUnits("100000000", 18));

    const Factory = await ethers.getContractFactory("MockV2Factory");
    factory = await Factory.deploy();
    const Router = await ethers.getContractFactory("MockV2Router");
    router = await Router.deploy(await factory.getAddress());

    // Seed balances
    await vibe.transfer(lp.address, ethers.parseUnits("4000000", 18));
    await dai.transfer(lp.address, ethers.parseUnits("400000", 18));
    await vibe.transfer(trader.address, ethers.parseUnits("200000", 18));
    await dai.transfer(trader.address, ethers.parseUnits("20000", 18));

    // Exclude LP and Router from fees to provision liquidity cleanly
    await vibe.setExcludedFromFees(lp.address, true);
    await vibe.setExcludedFromFees(await router.getAddress(), true);

    // Create pair via router on first liquidity add
    await vibe.connect(lp).approve(await router.getAddress(), ethers.parseUnits("1000000", 18));
    await dai.connect(lp).approve(await router.getAddress(), ethers.parseUnits("100000", 18));
    await router.connect(lp).addLiquidity(
      await vibe.getAddress(),
      await dai.getAddress(),
      ethers.parseUnits("1000000", 18),
      ethers.parseUnits("100000", 18)
    );

    pair = await router.getPair(await vibe.getAddress(), await dai.getAddress());
  });

  it("router addLiquidity creates pair and sets reserves", async () => {
    const Pair = await ethers.getContractAt("MockV2Pair", pair);
    const [r0, r1] = await Pair.getReserves();
    const token0 = await Pair.token0();
    const vibeAddr = await vibe.getAddress();
    if (token0.toLowerCase() === vibeAddr.toLowerCase()) {
      expect(r0).to.equal(ethers.parseUnits("1000000", 18));
      expect(r1).to.equal(ethers.parseUnits("100000", 18));
    } else {
      expect(r1).to.equal(ethers.parseUnits("1000000", 18));
      expect(r0).to.equal(ethers.parseUnits("100000", 18));
    }
  });

  it("swapExactTokensForTokensSupportingFeeOnTransferTokens works with pair excluded from fees/limits", async () => {
    await vibe.setExcludedFromFees(pair, true);
    await vibe.setExcludedFromLimits(pair, true);

    // Trader swaps VIBE -> DAI through router
    const amountIn = ethers.parseUnits("5000", 18);
    await vibe.connect(trader).approve(await router.getAddress(), amountIn);
    await router.connect(trader).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [await vibe.getAddress(), await dai.getAddress()],
      trader.address
    );

    expect(await dai.balanceOf(trader.address)).to.be.gt(ethers.parseUnits("20000", 18));
  });

  it("swap supports fee-on-transfer into pair (pair not excluded)", async () => {
    // ensure trader pays fees
    await vibe.setExcludedFromFees(trader.address, false);

    const amountIn = ethers.parseUnits("10000", 18);
    await vibe.connect(trader).approve(await router.getAddress(), amountIn);
    await router.connect(trader).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amountIn,
      0,
      [await vibe.getAddress(), await dai.getAddress()],
      trader.address
    );

    // Still receives some DAI despite fee-on-transfer
    expect(await dai.balanceOf(trader.address)).to.be.gt(ethers.parseUnits("20000", 18));
  });
});

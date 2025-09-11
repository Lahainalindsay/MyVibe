const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – gas thresholds", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b;
  let vibe;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b] =
      await ethers.getSigners();

    const Vibe = await ethers.getContractFactory("VibeToken");
    vibe = await Vibe.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address
    );

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("100000", 18));
  });

  it("transfer without fees stays under threshold", async () => {
    await vibe.setExcludedFromFees(a.address, true);
    const amt = ethers.parseUnits("1000", 18);
    const gas = await vibe.connect(a).transfer.estimateGas(b.address, amt);
    // regression budget: 90k
    expect(gas).to.be.lt(90000n);
  });

  it("transfer with fees stays under threshold", async () => {
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);
    const amt = ethers.parseUnits("1000", 18);
    const gas = await vibe.connect(a).transfer.estimateGas(b.address, amt);
    // regression budget: normal ~<160k; under coverage instrumentation it's higher
    const isCov = !!process.env.SOLIDITY_COVERAGE;
    const cap = isCov ? 600000n : 160000n;
    expect(gas).to.be.lt(cap);
  });
});

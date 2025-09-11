const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – admin/audit additions", function () {
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

    await vibe.transfer(a.address, ethers.parseUnits("200000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("200000", 18));
  });

  it("minTokensForDividends equality qualifies holder", async () => {
    const balA = await vibe.balanceOf(a.address);
    await vibe.setMinTokensForDividends(balA);
    // Trigger holder status update
    await vibe.connect(a).transfer(b.address, 1n);
    const count = Number(await vibe.getHolderCount());
    let found = false;
    for (let i = 0; i < count; i++) {
      if ((await vibe.getHolderAt(i)) === a.address) found = true;
    }
    expect(found).to.equal(true);
  });

  it("fees configuration applies to next transfers", async () => {
    await vibe.setFees(300, 300, 100); // 7% total
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);

    const amt = ethers.parseUnits("10000", 18);
    const feeDen = 10_000n;
    const burn = (amt * 300n) / feeDen;
    const daoF = (amt * 300n) / feeDen;
    const totalFee = (amt * (300n + 300n + 100n)) / feeDen;
    const refF = totalFee - burn - daoF;

    await expect(vibe.connect(a).transfer(b.address, amt))
      .to.emit(vibe, "FeesDistributed")
      .withArgs(burn, daoF, refF);
  });

  it("excludedFromLimits on sender OR recipient allows transfer when trading disabled", async () => {
    // turn trading off
    await vibe.setTradingEnabled(false);
    // exclude sender
    await vibe.setExcludedFromLimits(a.address, true);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;

    // reset
    await vibe.setExcludedFromLimits(a.address, false);
    // exclude recipient
    await vibe.setExcludedFromLimits(b.address, true);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });
});


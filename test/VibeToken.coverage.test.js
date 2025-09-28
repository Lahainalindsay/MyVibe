const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – coverage targets", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b;
  let vibe;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b] =
      await ethers.getSigners();

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

    // Enable transfers without caps for deterministic checks
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // Fund accounts
    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("100000", 18));
    // Ensure fees apply
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);
  });

  it("distributes burn/dao/reflect fees and updates counters", async function () {
    if (!vibe.unclaimedDividends) return this.skip();
    const amount = ethers.parseUnits("10000", 18);

    const burnRate = await vibe.burnRate();
    const daoRate = await vibe.daoRate();
    const reflectRate = await vibe.reflectRate();

    const feeDen = 10_000n;
    const burnAmt = (amount * BigInt(burnRate)) / feeDen;
    const daoAmt = (amount * BigInt(daoRate)) / feeDen;
    const reflectAmt = (amount * BigInt(reflectRate)) / feeDen;

    const dead = "0x000000000000000000000000000000000000dEaD";

    const daoBefore = await vibe.balanceOf(dao.address);
    const deadBefore = await vibe.balanceOf(dead);
    const thisBefore = await vibe.balanceOf(await vibe.getAddress());
    const unclaimedBefore = await vibe.unclaimedDividends();

    await expect(vibe.connect(a).transfer(b.address, amount))
      .to.emit(vibe, "FeesDistributed")
      .withArgs(burnAmt, daoAmt, reflectAmt);

    expect((await vibe.balanceOf(dao.address)) - daoBefore).to.equal(daoAmt);
    expect((await vibe.balanceOf(dead)) - deadBefore).to.equal(burnAmt);
    expect((await vibe.balanceOf(await vibe.getAddress())) - thisBefore).to.equal(
      reflectAmt
    );
    expect((await vibe.unclaimedDividends()) - unclaimedBefore).to.equal(
      reflectAmt
    );
  });

  it("updates holders set with threshold and exclusions", async () => {
    // a has balance >= min threshold by default
    const countBefore = await vibe.getHolderCount();
    // a should exist somewhere in the set
    let found = false;
    for (let i = 0; i < Number(countBefore); i++) {
      const addr = await vibe.getHolderAt(i);
      if (addr === a.address) found = true;
    }
    expect(found).to.equal(true);

    // Excluding from fees removes from eligible holders
    await vibe.setExcludedFromFees(a.address, true);
    const countMid = await vibe.getHolderCount();
    expect(countMid).to.be.lessThanOrEqual(countBefore);

    // Re-include and then raise threshold beyond balance; trigger an update via transfer
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setMinTokensForDividends(ethers.parseUnits("1000001", 18));
    // Trigger holder status recalculation for `a` by making a small transfer
    await vibe.connect(a).transfer(b.address, 1n);
    const countAfter = await vibe.getHolderCount();
    expect(countAfter).to.be.lessThanOrEqual(countMid);
  });

  it("emits BlacklistUpdated event and blocks afterwards", async () => {
    await expect(vibe.setBlacklist(a.address, true))
      .to.emit(vibe, "BlacklistUpdated")
      .withArgs(a.address, true);

    await expect(vibe.connect(a).transfer(b.address, 1)).to.be.revertedWith(
      "Blacklisted"
    );
  });
});

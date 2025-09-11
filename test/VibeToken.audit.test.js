const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – audit-focused tests", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b;
  let Vibe, vibe;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b] =
      await ethers.getSigners();
    Vibe = await ethers.getContractFactory("VibeToken");
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

  it("constructor reverts if DAO wallet is zero", async () => {
    await expect(
      Vibe.deploy(ethers.ZeroAddress, staking.address, fairLaunch.address, influencer.address)
    ).to.be.revertedWith("DAO wallet required");
  });

  it("direct transfers to blacklisted dao wallet revert", async () => {
    await vibe.setBlacklist(dao.address, true);
    await expect(
      vibe.connect(a).transfer(dao.address, 1n)
    ).to.be.revertedWith("Blacklisted");
  });

  it("recipient excludedFromFees avoids fee collection", async () => {
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, true);
    const amount = ethers.parseUnits("1000", 18);
    const before = await vibe.balanceOf(b.address);
    const tx = vibe.connect(a).transfer(b.address, amount);
    await expect(tx).to.not.emit(vibe, "FeesDistributed");
    const after = await vibe.balanceOf(b.address);
    expect(after - before).to.equal(amount);
  });

  it("claiming twice leaves nothing to claim (fees disabled during claim)", async () => {
    // create reflections by an a->b transfer with fees
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);
    const amt = ethers.parseUnits("10000", 18);
    await vibe.connect(a).transfer(b.address, amt);
    // a should have some dividends due
    const owing = await vibe.dividendsOwing(a.address);
    expect(owing).to.be.gt(0);
    // disable fees to avoid generating new reflections during claim
    await vibe.setFeesEnabled(false);
    await expect(vibe.connect(a).claimDividends()).to.emit(vibe, "DividendsClaimed");
    await expect(vibe.connect(a).claimDividends()).to.be.revertedWith("Nothing to claim");
  });
});

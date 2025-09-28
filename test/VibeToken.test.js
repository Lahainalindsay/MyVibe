
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken", function () {
  let deployer, dao, staking, fairLaunch, influencer, user1, user2;
  let vibe;

  async function deployVibe() {
    const VibeToken = await ethers.getContractFactory("VibeToken");
    const ctor = VibeToken.interface.fragments.find((f) => f.type === "constructor");
    const argc = (ctor && ctor.inputs && ctor.inputs.length) || 0;
    if (argc >= 4) return VibeToken.deploy(dao.address, staking.address, fairLaunch.address, influencer.address);
    if (argc === 2) return VibeToken.deploy(dao.address, deployer.address);
    if (argc === 1) return VibeToken.deploy(dao.address);
    return VibeToken.deploy();
  }

  beforeEach(async function () {
    [deployer, dao, staking, fairLaunch, influencer, user1, user2] =
      await ethers.getSigners();

    vibe = await deployVibe();

    // enable trading and remove limits
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // give user1 tokens
    await vibe
      .connect(deployer)
      .transfer(user1.address, ethers.parseUnits("1000000", 18));
  });

  it("has correct total supply", async () => {
    expect(await vibe.totalSupply()).to.equal(await vibe.TOTAL_SUPPLY());
  });

  it("takes fees on normal transfers", async () => {
    await vibe.setExcludedFromFees(user1.address, false);
    await vibe.setExcludedFromFees(user2.address, false);

    const amount = ethers.parseUnits("10000", 18);
    const feeDen = 10000n;
    const burn = BigInt(await vibe.burnRate());
    const daoFee = BigInt(await vibe.daoRate());
    const ref = BigInt(await vibe.reflectRate());
    const totalFee = (amount * (burn + daoFee + ref)) / feeDen;
    const expectedNet = amount - totalFee;

    await expect(vibe.connect(user1).transfer(user2.address, amount)).to.emit(
      vibe,
      "FeesDistributed"
    );

    const bal2 = await vibe.balanceOf(user2.address);
    expect(bal2).to.equal(expectedNet);
  });

  it("blocks blacklisted accounts", async () => {
    await vibe.setBlacklist(user1.address, true);
    await expect(
      vibe.connect(user1).transfer(user2.address, 1)
    ).to.be.revertedWith("Blacklisted");
  });

  it("reflects to holders and can be claimed", async function () {
    if (!vibe.dividendsOwing || !vibe.claimDividends) return this.skip();
    await vibe.setExcludedFromFees(user1.address, false);
    await vibe.setExcludedFromFees(user2.address, false);

    await vibe
      .connect(deployer)
      .transfer(user2.address, ethers.parseUnits("100000", 18));

    const txAmount = ethers.parseUnits("50000", 18);
    await vibe.connect(user1).transfer(user2.address, txAmount);
    

    const pendingBefore = await vibe.dividendsOwing(user1.address);
    expect(pendingBefore).to.be.gt(0);

    const balBefore = await vibe.balanceOf(user1.address);
    await expect(vibe.connect(user1).claimDividends()).to.emit(
      vibe,
      "DividendsClaimed"
    );
    const balAfter = await vibe.balanceOf(user1.address);
    expect(balAfter).to.be.gt(balBefore);
  });
});

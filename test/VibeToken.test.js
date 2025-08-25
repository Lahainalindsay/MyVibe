const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken", function () {
  let deployer, dao, staking, fairLaunch, influencer, user1, user2;
  let vibe;

  beforeEach(async function () {
    [deployer, dao, staking, fairLaunch, influencer, user1, user2] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      deployer.address
    );

    // Enable trading and relax limits for predictable tests
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // Fund user1 from deployer (excluded -> no fees on this transfer)
    await vibe.connect(deployer).transfer(user1.address, ethers.parseUnits("1000000", 18));
  });

  it("has correct total supply", async () => {
    expect(await vibe.totalSupply()).to.equal(await vibe.TOTAL_SUPPLY());
  });

  it("takes fees on normal transfers", async () => {
    // Ensure both parties are fee-able
    await vibe.setExcludedFromFees(user1.address, false);
    await vibe.setExcludedFromFees(user2.address, false);

    const amount = ethers.parseUnits("10000", 18);
    const feeDen = BigInt(10000);
    const burn = BigInt(await vibe.burnRate());
    const dao = BigInt(await vibe.daoRate());
    const ref = BigInt(await vibe.reflectRate());
    const totalFee = (amount * (burn + dao + ref)) / feeDen;
    const expectedNet = amount - totalFee;

    await expect(vibe.connect(user1).transfer(user2.address, amount))
      .to.emit(vibe, "FeesDistributed");

    const bal2 = await vibe.balanceOf(user2.address);
    expect(bal2).to.equal(expectedNet);
  });

  it("blocks blacklisted accounts", async () => {
    await vibe.setBlacklist(user1.address, true);
    await expect(vibe.connect(user1).transfer(user2.address, 1)).to.be.revertedWith("Blacklisted");
  });

  it("snapshots can be triggered by authorized account", async () => {
    await expect(vibe.connect(user1).snapshot()).to.be.revertedWith("Not authorized");
    await vibe.setSnapshotAuthorization(user1.address, true);
    const id = await (await vibe.connect(user1).snapshot()).wait();
    // event tested by no revert; not asserting id number here
  });

  it("reflects to holders and can be claimed", async () => {
    // Make both fee-able and eligible
    await vibe.setExcludedFromFees(user1.address, false);
    await vibe.setExcludedFromFees(user2.address, false);

    // user2 holds some tokens to be eligible too
    await vibe.connect(deployer).transfer(user2.address, ethers.parseUnits("100000", 18));

    // Transfer that generates reflection
    const txAmount = ethers.parseUnits("50000", 18);
    await vibe.connect(user1).transfer(user2.address, txAmount);

    // Some reflections accrued; user1 claims
    const pendingBefore = await vibe.dividendsOwing(user1.address);
    expect(pendingBefore).to.be.gt(0);

    const balBefore = await vibe.balanceOf(user1.address);
    await expect(vibe.connect(user1).claimDividends())
      .to.emit(vibe, "DividendsClaimed");
    const balAfter = await vibe.balanceOf(user1.address);
    expect(balAfter).to.be.gt(balBefore);
  });
});


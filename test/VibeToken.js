const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken", function () {
  let vibe, owner, dao, staking, fairLaunch, influencer, team, user;

  beforeEach(async function () {
    [owner, dao, staking, fairLaunch, influencer, team, user] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      team.address
    );
    await vibe.deployed();
  });

  it("has correct name and symbol", async function () {
    expect(await vibe.name()).to.equal("VIBE");
    expect(await vibe.symbol()).to.equal("VIBE");
  });

  it("mints correct allocations", async function () {
    const total = await vibe.TOTAL_SUPPLY();
    // 50% to fair launch, 20% dao, 10% influencer, 10% team, 10% staking
    expect(await vibe.balanceOf(fairLaunch.address)).to.equal(total.mul(50).div(100));
    expect(await vibe.balanceOf(dao.address)).to.equal(total.mul(20).div(100));
    expect(await vibe.balanceOf(influencer.address)).to.equal(total.mul(10).div(100));
    expect(await vibe.balanceOf(team.address)).to.equal(0); // team gets tokens later (via withdraw)
    expect(await vibe.balanceOf(staking.address)).to.equal(total.mul(10).div(100));
  });

  // Add more tests here: trading, transfers, blacklisting, etc!
});

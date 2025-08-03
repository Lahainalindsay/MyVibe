const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken", function () {
  let vibe, owner, dao, staking, fairLaunch, influencer, team, user, user2;
  let FEE_TOTAL;

  beforeEach(async function () {
    [owner, dao, staking, fairLaunch, influencer, team, user, user2] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      team.address
    );

    await vibe.connect(owner).enableTrading();

    // Use BigInt for all math in ethers v6
    const burn = BigInt(await vibe.burnRate());
    const reflect = BigInt(await vibe.reflectRate());
    const daoRate = BigInt(await vibe.daoRate());
    FEE_TOTAL = burn + reflect + daoRate;
  });

  it("has correct name and symbol", async function () {
    expect(await vibe.name()).to.equal("VIBE");
    expect(await vibe.symbol()).to.equal("VIBE");
  });

  it("mints correct allocations", async function () {
    const total = BigInt(await vibe.TOTAL_SUPPLY());
    expect(await vibe.balanceOf(fairLaunch.address)).to.equal((total * 50n) / 100n);
    expect(await vibe.balanceOf(dao.address)).to.equal((total * 20n) / 100n);
    expect(await vibe.balanceOf(influencer.address)).to.equal((total * 10n) / 100n);
    expect(await vibe.balanceOf(team.address)).to.equal(0n);
    expect(await vibe.balanceOf(staking.address)).to.equal((total * 10n) / 100n);
  });

  it("allows transfers between accounts (accounts for fees)", async function () {
    const total = BigInt(await vibe.TOTAL_SUPPLY());
    const transferAmount = total / 100n; // 1%
    const FEE_DENOMINATOR = 10000n;

    const fairLaunchStart = BigInt(await vibe.balanceOf(fairLaunch.address));
    const userStart = BigInt(await vibe.balanceOf(user.address));

    const fee = (transferAmount * FEE_TOTAL) / FEE_DENOMINATOR;
    const expectedReceived = transferAmount - fee;

    await vibe.connect(fairLaunch).transfer(user.address, transferAmount);

    const fairLaunchEnd = BigInt(await vibe.balanceOf(fairLaunch.address));
    const userEnd = BigInt(await vibe.balanceOf(user.address));

    expect(fairLaunchEnd).to.equal(fairLaunchStart - transferAmount);
    expect(userEnd).to.equal(userStart + expectedReceived);
  });

  it("allows approve and transferFrom (accounts for fees and tx limit)", async function () {
    const total = BigInt(await vibe.TOTAL_SUPPLY());
    const amount = total / 100n;
    const FEE_DENOMINATOR = 10000n;

    await vibe.connect(fairLaunch).approve(user.address, amount);
    expect(BigInt(await vibe.allowance(fairLaunch.address, user.address))).to.equal(amount);

    const fee = (amount * FEE_TOTAL) / FEE_DENOMINATOR;
    const expected = amount - fee;

    await vibe.connect(user).transferFrom(fairLaunch.address, user2.address, amount);

    expect(BigInt(await vibe.balanceOf(user2.address))).to.equal(expected);
  });

  it("emits a Transfer event on transfer (checks correct post-fee Transfer)", async function () {
    const total = BigInt(await vibe.TOTAL_SUPPLY());
    const amount = total / 100n;
    const FEE_DENOMINATOR = 10000n;
    const expected = amount - (amount * FEE_TOTAL) / FEE_DENOMINATOR;

    const tx = await vibe.connect(fairLaunch).transfer(user.address, amount);
    const receipt = await tx.wait();

    const transferEvents = receipt.logs
      .map(log => {
        try {
          return vibe.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(e => e && e.name === "Transfer" && e.args.to === user.address);

    const found = transferEvents.some(e => e.args.value === expected);
    expect(found, "No correct transfer event found").to.be.true;
  });

  it("reverts on transfer more than balance", async function () {
    // ethers.parseUnits returns a bigint in v6
    const over = ethers.parseUnits("99999999", 18);
    await expect(
      vibe.connect(user).transfer(user2.address, over)
    ).to.be.reverted;
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – STRICT cooldown boundaries (non-coverage)", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b;
  let vibe;

  async function increase(seconds) {
    await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
    await ethers.provider.send("evm_mine", []);
  }

  before(function () {
    const isCoverage = !!(process.env.SOLIDITY_COVERAGE || global.__SOLIDITY_COVERAGE__);
    if (isCoverage) this.skip();
  });

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
    await vibe.setLimits(full, full, 60); // 60s cooldown

    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
  });

  it("reverts just before cooldown expires and succeeds at boundary", async () => {
    const tx = await vibe.connect(a).transfer(b.address, 1n);
    const rc = await tx.wait();
    const blk = await ethers.provider.getBlock(rc.blockNumber);
    const t0 = blk.timestamp;
    const cd = 60;

    // Set next block to t0 + cd - 1 => should revert due to cooldown
    await ethers.provider.send("evm_setNextBlockTimestamp", [t0 + cd - 1]);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.be.reverted;

    // Set next block to t0 + cd => should pass at boundary
    await ethers.provider.send("evm_setNextBlockTimestamp", [t0 + cd]);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });
});

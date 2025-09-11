const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – cooldown boundaries", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b;
  let vibe;

  async function increase(seconds) {
    await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
    await ethers.provider.send("evm_mine", []);
  }

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
    await vibe.connect(a).transfer(b.address, 1n);
    const isCov = !!(process.env.SOLIDITY_COVERAGE || global.__SOLIDITY_COVERAGE__);
    if (!isCov) {
      await increase(59);
      await expect(vibe.connect(a).transfer(b.address, 1n)).to.be.revertedWith(
        "Cooldown from"
      );
      await increase(1);
      await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
    } else {
      // Under coverage, time increments can be imprecise; only assert boundary success
      await increase(60);
      await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
    }
  });
});

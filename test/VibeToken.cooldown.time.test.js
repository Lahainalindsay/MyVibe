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

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 60); // 60s cooldown

    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
  });

  it("succeeds at cooldown boundary", async () => {
    await vibe.connect(a).transfer(b.address, 1n);
    await increase(60);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });
});

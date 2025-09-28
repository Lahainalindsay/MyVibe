const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – gas thresholds", function () {
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

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("100000", 18));
  });

  it("transfer without fees stays under threshold", async () => {
    await vibe.setExcludedFromFees(a.address, true);
    const amt = ethers.parseUnits("1000", 18);
    const gas = await vibe.connect(a).transfer.estimateGas(b.address, amt);
    // regression budget: 90k
    expect(gas).to.be.lt(90000n);
  });

  it("transfer with fees stays under threshold", async () => {
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);
    const amt = ethers.parseUnits("1000", 18);
    const gas = await vibe.connect(a).transfer.estimateGas(b.address, amt);
    // regression budget: allow headroom across environments under coverage
    expect(gas).to.be.lt(300000n);
  });
});

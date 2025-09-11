const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("SoulArcanaNFT – arcana properties", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] =
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
    await vibe.setLimits(full, full, 0);

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      owner.address
    );

    await soul.connect(owner).setPrices(parseEther("0.01"), parseUnits("1000", 18));
  });

  it("arcana value is within expected range [0,10000)", async () => {
    const price = await soul.mintPriceETH();
    await soul.connect(user).mint(3n, { value: price * 3n });
    for (let i = 0; i < 3; i++) {
      const arc = await soul.tokenArcana(i);
      expect(arc).to.be.gte(0);
      expect(arc).to.be.lt(10000);
    }
  });
});


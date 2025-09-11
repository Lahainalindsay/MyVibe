const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("SoulArcanaNFT – events", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user, treasury;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user, treasury] =
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
  });

  it("emits on setPrices, setTreasury, setMaxMintPerTx", async () => {
    await expect(
      soul.connect(owner).setPrices(parseEther("0.02"), parseUnits("2000", 18))
    )
      .to.emit(soul, "PricesUpdated")
      .withArgs(parseEther("0.02"), parseUnits("2000", 18));

    await expect(soul.connect(owner).setTreasury(treasury.address))
      .to.emit(soul, "TreasuryUpdated")
      .withArgs(treasury.address);

    await expect(soul.connect(owner).setMaxMintPerTx(25))
      .to.emit(soul, "MaxMintUpdated")
      .withArgs(25);
  });

  it("withdrawERC20 reverts for zero recipient", async () => {
    await expect(
      soul.connect(owner).withdrawERC20(await vibe.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWith("Zero");
  });
});


const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("WhatsYourVibeNFT – audit-focused tests", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] =
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

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("WhatsYourVibeNFT");
    soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      owner.address
    );

    // fund user with VIBE
    await vibe.transfer(user.address, parseUnits("10000", 18));
  });

  it("mintWithVibe reverts without allowance (ERC20InsufficientAllowance)", async () => {
    await expect(soul.connect(user).mintWithVibe(1n)).to.be.revertedWithCustomError(
      vibe,
      "ERC20InsufficientAllowance"
    );
  });

  it("setPrices increases cost and insufficient ETH reverts", async () => {
    const oldPrice = await soul.mintPriceETH();
    await soul.connect(owner).setPrices(parseEther("0.1"), parseUnits("1000", 18));
    const newPrice = await soul.mintPriceETH();
    expect(newPrice).to.be.gt(oldPrice);
    await expect(soul.connect(user).mint(1n, { value: oldPrice })).to.be.revertedWith(
      "Insufficient ETH"
    );
  });
});

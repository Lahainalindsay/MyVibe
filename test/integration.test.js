const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("Integration: Vibe + WhatsYourVibe + Renderer", function () {
  it("links contracts and mints via VIBE end-to-end", async () => {
    const [deployer, dao, staking, fairLaunch, influencer, owner, minter] =
      await ethers.getSigners();

    const Vibe = await ethers.getContractFactory("VibeToken");
    const vibe = await Vibe.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address
    );
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe
      .connect(deployer)
      .transfer(minter.address, parseUnits("5000", 18));
    await vibe.setExcludedFromFees(minter.address, true);

    const Renderer = await ethers.getContractFactory(
      "SigilArcanaOnChainRenderer"
    );
    const renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("WhatsYourVibeNFT");
    const soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      owner.address
    );
    await soul.connect(owner).setRevealed(true);

    await soul
      .connect(owner)
      .setPrices(
        parseEther("0.01"),
        parseUnits("1000", 18)
      );
    await soul.connect(owner).setRevealed(true);

    const qty = 3n;
    const price = await soul.mintPriceVIBE();
    const total = BigInt(price.toString()) * qty;

    await vibe.connect(minter).approve(await soul.getAddress(), total);
    await expect(soul.connect(minter).mintWithVibe(qty)).to.emit(
      soul,
      "Minted"
    );

    expect(await soul.balanceOf(minter.address)).to.equal(qty);
  });
});

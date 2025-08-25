const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulArcanaNFT", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] = await ethers.getSigners();

    // Vibe
    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      deployer.address
    );
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // give user some VIBE and make user fee-excluded so transferFrom cost is predictable
    await vibe.connect(deployer).transfer(user.address, ethers.parseUnits("100000", 18));
    await vibe.setExcludedFromFees(user.address, true);

    // Renderer
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    // NFT
    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    soul = await Soul.deploy(await renderer.getAddress(), await vibe.getAddress(), owner.address);

    // Owner sets prices
    await soul.connect(owner).setPrices(ethers.parseEther("0.01"), ethers.parseUnits("1000", 18));
  });

  it("mints with ETH (quantity)", async () => {
    const qty = 3;
    const price = await soul.mintPriceETH();
    const cost = price * BigInt(qty);

    await expect(soul.connect(user).mint(qty, { value: cost }))
      .to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
    const uri = await soul.tokenURI(0);
    expect(uri).to.be.a("string");
    expect(uri.startsWith("data:application/json;base64,")).to.be.true;
  });

  it("mints with VIBE (quantity)", async () => {
    const qty = 5;
    const vPrice = await soul.mintPriceVIBE();
    const cost = vPrice * BigInt(qty);

    await vibe.connect(user).approve(await soul.getAddress(), cost);

    await expect(soul.connect(user).mintWithVibe(qty))
      .to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
  });

  it("reverts on zero quantity", async () => {
    await expect(soul.connect(user).mint(0, { value: 0 })).to.be.revertedWith("Quantity > 0");
    await expect(soul.connect(user).mintWithVibe(0)).to.be.revertedWith("Quantity > 0");
  });

  it("reverts if insufficient ETH", async () => {
    await expect(soul.connect(user).mint(2, { value: 0 })).to.be.revertedWith("Insufficient ETH");
  });
});

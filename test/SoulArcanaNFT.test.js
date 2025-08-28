const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulArcanaNFT", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      deployer.address
    );
    await (await vibe.setTradingEnabled(true)).wait();
    const full = await vibe.TOTAL_SUPPLY();
    await (await vibe.setLimits(full, full, 0)).wait();

    await (await vibe.connect(deployer).transfer(user.address, ethers.parseUnits("100000", 18))).wait();
    await (await vibe.setExcludedFromFees(user.address, true)).wait();

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    soul = await Soul.deploy(await renderer.getAddress(), await vibe.getAddress(), owner.address);

    await (await soul.connect(owner).setPrices(ethers.parseEther("0.01"), ethers.parseUnits("1000", 18))).wait();
  });

  it("mints with ETH (quantity)", async () => {
    const qty = 3n;
    const price = await soul.mintPriceETH();
    const cost = price * qty;

    await expect(soul.connect(user).mint(qty, { value: cost }))
      .to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
    const uri = await soul.tokenURI(0);
    expect(uri.startsWith("data:application/json;base64,")).to.be.true;
  });

  it("mints with VIBE (quantity)", async () => {
    const qty = 5n;
    const vPrice = await soul.mintPriceVIBE();
    const cost = vPrice * qty;

    await (await vibe.connect(user).approve(await soul.getAddress(), cost)).wait();

    await expect(soul.connect(user).mintWithVibe(qty)).to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
  });

  it("reverts on zero quantity", async () => {
    await expect(soul.connect(user).mint(0, { value: 0 })).to.be.revertedWith("Quantity > 0");
    await expect(soul.connect(user).mintWithVibe(0)).to.be.revertedWith("Quantity > 0");
  });

  it("reverts if insufficient ETH", async () => {
    await expect(soul.connect(user).mint(2n, { value: 0 })).to.be.revertedWith("Insufficient ETH");
  });

  it("stores arcana values per token", async () => {
    await (await soul.connect(user).mint(2n, { value: (await soul.mintPriceETH()) * 2n })).wait();
    const arc0 = await soul.tokenArcana(0);
    const arc1 = await soul.tokenArcana(1);
    expect(arc0).to.not.equal(arc1);
  });

  it("treasury receives ETH and VIBE", async () => {
    const treasury = await soul.treasury();

    // ETH
    const ethPrice = await soul.mintPriceETH();
    const beforeEth = await ethers.provider.getBalance(treasury);
    await (await soul.connect(user).mint(1n, { value: ethPrice })).wait();
    const afterEth = await ethers.provider.getBalance(treasury);
    expect(afterEth - beforeEth).to.equal(ethPrice);

    // VIBE
    const qty = 2n;
    const vPrice = await soul.mintPriceVIBE();
    const total = vPrice * qty;
    await (await vibe.connect(user).approve(await soul.getAddress(), total)).wait();
    const beforeVibe = await vibe.balanceOf(treasury);
    await (await soul.connect(user).mintWithVibe(qty)).wait();
    const afterVibe = await vibe.balanceOf(treasury);
    expect(afterVibe - beforeVibe).to.equal(total);
  });
});
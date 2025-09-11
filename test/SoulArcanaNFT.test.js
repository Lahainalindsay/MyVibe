const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("SoulArcanaNFT", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] =
      await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
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
      .transfer(user.address, parseUnits("100000", 18));
    await vibe.setExcludedFromFees(user.address, true);

    const Renderer = await ethers.getContractFactory(
      "SigilArcanaOnChainRenderer"
    );
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      owner.address
    );

    await soul
      .connect(owner)
      .setPrices(
        parseEther("0.01"),
        parseUnits("1000", 18)
      );
  });

  it("mints with ETH (quantity)", async () => {
    const qty = 3n;
    const price = await soul.mintPriceETH();
    const cost = BigInt(price.toString()) * qty;

    await expect(soul.connect(user).mint(qty, { value: cost })).to.emit(
      soul,
      "Minted"
    );

    expect(await soul.balanceOf(user.address)).to.equal(qty);
  });

  it("mints with VIBE (quantity)", async () => {
    const qty = 5n;
    const vPrice = await soul.mintPriceVIBE();
    const cost = BigInt(vPrice.toString()) * qty;

    await vibe.connect(user).approve(await soul.getAddress(), cost);

    await expect(soul.connect(user).mintWithVibe(qty)).to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
  });
  it("reverts on zero quantity", async () => {
    await expect(soul.connect(user).mint(0n, { value: 0n })).to.be.revertedWith("Quantity > 0");
    await expect(soul.connect(user).mintWithVibe(0n)).to.be.revertedWith("Quantity > 0");
  });

  it("refunds excess ETH on mint", async () => {
    const qty = 2n;
    const price = await soul.mintPriceETH();
    const overpay = price * qty + parseEther("0.05");

    const before = await ethers.provider.getBalance(await soul.getAddress());
    await soul.connect(user).mint(qty, { value: overpay });
    const after = await ethers.provider.getBalance(await soul.getAddress());

    // Contract balance should only increase by the exact cost, not including overpay
    expect(after - before).to.equal(price * qty);
  });

  it("reverts if insufficient ETH", async () => {
    await expect(soul.connect(user).mint(2n, { value: 0n })).to.be.revertedWith("Insufficient ETH");
  });

  it("stores arcana values per token", async () => {
    const priceEth = await soul.mintPriceETH();
    await soul.connect(user).mint(2n, { value: priceEth * 2n });
    const arc0 = await soul.tokenArcana(0);
    const arc1 = await soul.tokenArcana(1);
    expect(arc0).to.not.equal(arc1);
  });

  it("treasury receives ETH and VIBE", async () => {
    const treasury = await soul.treasury();

    const ethPrice = await soul.mintPriceETH();
    const beforeEth = await ethers.provider.getBalance(treasury);
    await soul.connect(user).mint(1n, { value: ethPrice });
    const afterEth = await ethers.provider.getBalance(treasury);
    expect(afterEth - beforeEth).to.equal(ethPrice);

    const qty = 2n;
    const vPrice = await soul.mintPriceVIBE();
    const total = vPrice * qty;
    await vibe.connect(user).approve(await soul.getAddress(), total);
    const beforeVibe = await vibe.balanceOf(treasury);
    await soul.connect(user).mintWithVibe(qty);
    const afterVibe = await vibe.balanceOf(treasury);
    expect(afterVibe - beforeVibe).to.equal(total);
  });
});

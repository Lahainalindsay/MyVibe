const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseUnits, parseEther } = ethers;

describe("WhatsYourVibeNFT – admin & withdraw", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user, treasury;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user, treasury] =
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
    await vibe.transfer(user.address, parseUnits("10000", 18));
    await vibe.setExcludedFromFees(user.address, true);

    const Renderer = await ethers.getContractFactory(
      "SigilArcanaOnChainRenderer"
    );
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("WhatsYourVibeNFT");
    soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      owner.address
    );
  });

  it("only owner can set prices and treasury", async () => {
    await expect(
      soul.connect(user).setPrices(parseEther("0.02"), parseUnits("2000", 18))
    ).to.be.revertedWithCustomError(soul, "OwnableUnauthorizedAccount");

    await expect(
      soul.connect(user).setTreasury(treasury.address)
    ).to.be.revertedWithCustomError(soul, "OwnableUnauthorizedAccount");
  });

  it("setTreasury rejects zero", async () => {
    await expect(soul.connect(owner).setTreasury(ethers.ZeroAddress)).to.be
      .reverted;
  });

  it("setMaxMintPerTx enforces non-zero and can be raised", async () => {
    await expect(soul.connect(owner).setMaxMintPerTx(0)).to.be.reverted;
    await soul.connect(owner).setMaxMintPerTx(3);
    await expect(
      soul.connect(user).mint(5, { value: (await soul.mintPriceETH()) * 5n })
    ).to.be.revertedWith("Too many");
  });

  it("withdraws ETH to owner by default", async () => {
    const price = await soul.mintPriceETH();
    await soul.connect(user).mint(2n, { value: price * 2n });

    const before = await ethers.provider.getBalance(owner.address);
    await soul.connect(owner).withdrawETH(ethers.ZeroAddress);
    const after = await ethers.provider.getBalance(owner.address);
    expect(after).to.be.gt(before);
  });

  it("withdraws ERC20 to specified recipient", async () => {
    await soul.connect(owner).setTreasury(await soul.getAddress());

    const qty = 2n;
    const cost = (await soul.mintPriceVIBE()) * qty;
    await vibe.connect(user).approve(await soul.getAddress(), cost);
    await soul.connect(user).mintWithVibe(qty);

    // Move VIBE from contract to `treasury` by resetting treasury to an EOA and minting more
    await soul.connect(owner).setTreasury(treasury.address);

    await expect(
      soul.connect(owner).withdrawERC20(await vibe.getAddress(), treasury.address)
    ).to.not.be.reverted;
  });

  it("mintWithVibe sends VIBE to updated treasury (EOA)", async () => {
    await soul.connect(owner).setTreasury(treasury.address);
    const qty = 3n;
    const cost = (await soul.mintPriceVIBE()) * qty;
    await vibe.connect(user).approve(await soul.getAddress(), cost);
    const before = await vibe.balanceOf(treasury.address);
    await soul.connect(user).mintWithVibe(qty);
    const after = await vibe.balanceOf(treasury.address);
    expect(after - before).to.equal(cost);
  });

  it("pre-reveal shows gift box, then reveals to renderer", async () => {
    const price = await soul.mintPriceETH();
    await soul.connect(user).mint(1n, { value: price });
    const pre = await soul.tokenURI(0);
    expect(pre.startsWith("data:application/json;base64,")).to.be.true;
    // Reveal and expect a (different) tokenURI based on renderer
    await soul.connect(owner).setRevealed(true);
    const post = await soul.tokenURI(0);
    expect(post.startsWith("data:application/json;base64,")).to.be.true;
    expect(post).to.not.equal(pre);
  });

  it("reverts tokenURI for nonexistent token", async () => {
    await expect(soul.tokenURI(9999)).to.be.revertedWith("Nonexistent token");
  });

  it("withdraws ETH to explicit recipient", async () => {
    const price = await soul.mintPriceETH();
    await soul.connect(user).mint(1n, { value: price });

    const before = await ethers.provider.getBalance(treasury.address);
    await soul.connect(owner).withdrawETH(treasury.address);
    const after = await ethers.provider.getBalance(treasury.address);
    expect(after).to.be.gt(before);
  });

  it("withdrawERC20 reverts when no balance", async () => {
    await expect(
      soul.connect(owner).withdrawERC20(await vibe.getAddress(), owner.address)
    ).to.be.revertedWith("No balance");
  });
});

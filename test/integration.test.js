const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration: Vibe + SoulArcana + Renderer", function () {
  it("links contracts and mints via VIBE end-to-end", async () => {
    const [deployer, dao, staking, fairLaunch, influencer, owner, minter] = await ethers.getSigners();

    const Vibe = await ethers.getContractFactory("VibeToken");
    const vibe = await Vibe.deploy(
      dao.address, staking.address, fairLaunch.address, influencer.address, deployer.address
    );
    await (await vibe.setTradingEnabled(true)).wait();
    const full = await vibe.TOTAL_SUPPLY();
    await (await vibe.setLimits(full, full, 0)).wait();

    await (await vibe.connect(deployer).transfer(minter.address, ethers.parseUnits("5000", 18))).wait();
    await (await vibe.setExcludedFromFees(minter.address, true)).wait();

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    const soul = await Soul.deploy(await renderer.getAddress(), await vibe.getAddress(), owner.address);

    await (await soul.connect(owner).setPrices(ethers.parseEther("0.01"), ethers.parseUnits("1000", 18))).wait();

    const qty = 3n;
    const price = await soul.mintPriceVIBE();
    const total = price * qty;

    await (await vibe.connect(minter).approve(await soul.getAddress(), total)).wait();
    await expect(soul.connect(minter).mintWithVibe(qty)).to.emit(soul, "Minted");

    expect(await soul.balanceOf(minter.address)).to.equal(qty);

    const uri = await soul.tokenURI(0);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

    const base64Json = uri.split(",")[1];
    const metadata = JSON.parse(Buffer.from(base64Json, "base64").toString("utf8"));
    expect(metadata).to.have.property("name");
    expect(metadata).to.have.property("image");
  });
});
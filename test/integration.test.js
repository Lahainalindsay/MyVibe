const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration: Vibe + SoulArcana + Renderer", function () {
  it("links contracts and mints via VIBE end-to-end", async () => {
    const [deployer, dao, staking, fairLaunch, influencer, owner, minter] = await ethers.getSigners();

    // Deploy VIBE
    const Vibe = await ethers.getContractFactory("VibeToken");
    const vibe = await Vibe.deploy(
      dao.address, staking.address, fairLaunch.address, influencer.address, deployer.address
    );
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // Fund minter
    await vibe.connect(deployer).transfer(minter.address, ethers.parseUnits("5000", 18));
    await vibe.setExcludedFromFees(minter.address, true);

    // Renderer
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const renderer = await Renderer.deploy();

    // NFT
    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    const soul = await Soul.deploy(await renderer.getAddress(), await vibe.getAddress(), owner.address);

    await soul.connect(owner).setPrices(ethers.parseEther("0.01"), ethers.parseUnits("1000", 18));

    // Approve and mint with VIBE
    const qty = 3n;
    const price = await soul.mintPriceVIBE();
    const total = price * qty;

    await vibe.connect(minter).approve(await soul.getAddress(), total);
    await expect(soul.connect(minter).mintWithVibe(Number(qty))).to.emit(soul, "Minted");

    expect(await soul.balanceOf(minter.address)).to.equal(qty);

    // Check tokenURI returns base64 JSON
    const uri = await soul.tokenURI(0);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
  });
});

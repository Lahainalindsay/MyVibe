const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ownership – admin controls", function () {
  let deployer, dao, staking, fairLaunch, influencer, newOwner, user;
  let vibe, soul, renderer;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, newOwner, user] =
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

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("WhatsYourVibeNFT");
    soul = await Soul.deploy(
      await renderer.getAddress(),
      await vibe.getAddress(),
      deployer.address
    );
  });

  it("transfers VibeToken ownership and enforces onlyOwner", async () => {
    await vibe.transferOwnership(newOwner.address);
    await expect(vibe.setFees(0, 0, 0)).to.be.revertedWithCustomError(
      vibe,
      "OwnableUnauthorizedAccount"
    );
    await expect(vibe.connect(newOwner).setFees(0, 0, 0)).to.not.be.reverted;
  });

  it("renouncing VibeToken ownership disables admin functions", async () => {
    await vibe.renounceOwnership();
    await expect(vibe.setFees(0, 0, 0)).to.be.revertedWithCustomError(
      vibe,
      "OwnableUnauthorizedAccount"
    );
  });

  it("transfers WhatsYourVibeNFT ownership and enforces onlyOwner", async () => {
    await soul.transferOwnership(newOwner.address);
    await expect(soul.setMaxMintPerTx(10)).to.be.revertedWithCustomError(
      soul,
      "OwnableUnauthorizedAccount"
    );
    await expect(soul.connect(newOwner).setMaxMintPerTx(10)).to.not.be.reverted;
  });

  it("renouncing WhatsYourVibeNFT ownership disables admin functions", async () => {
    await soul.renounceOwnership();
    await expect(soul.setMaxMintPerTx(10)).to.be.revertedWithCustomError(
      soul,
      "OwnableUnauthorizedAccount"
    );
  });
});

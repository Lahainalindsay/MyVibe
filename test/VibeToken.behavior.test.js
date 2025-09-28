const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – behavior", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b, c;
  let vibe;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b, c] =
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

    // owner holds total supply; fund accounts
    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(c.address, ethers.parseUnits("100000", 18));
  });

  it("enforces trading toggle when not excluded from limits", async () => {
    // trading is off by default
    await expect(vibe.connect(a).transfer(b.address, 1)).to.be.revertedWith(
      "Trading off"
    );

    // enable trading and widen limits
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await expect(vibe.connect(a).transfer(b.address, 1)).to.not.be.reverted;
  });

  it("enforces maxTx and maxWallet", async () => {
    await vibe.setTradingEnabled(true);
    const maxTx = ethers.parseUnits("1000", 18);
    const maxWallet = ethers.parseUnits("200", 18);
    await vibe.setLimits(maxTx, maxWallet, 0);

    // a already has 100k, b has 100k. Reduce b to be under wallet cap
    await vibe.connect(b).transfer(deployer.address, ethers.parseUnits("99950", 18));

    await expect(
      vibe.connect(a).transfer(b.address, ethers.parseUnits("2000", 18))
    ).to.be.revertedWith("Tx limit");

    // Make wallet-cap failure with an amount <= maxTx
    // b currently ~50 tokens after reducing; top it up to near cap
    await vibe.connect(deployer).transfer(b.address, ethers.parseUnits("100", 18)); // b ~150
    await expect(
      vibe.connect(a).transfer(b.address, ethers.parseUnits("100", 18))
    ).to.be.revertedWith("Wallet cap");
  });

  it("enforces cooldown when set", async () => {
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 60); // 60s cooldown

    await vibe.connect(a).transfer(b.address, 10n);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.be.revertedWith(
      "Cooldown from"
    );
  });

  it("enforces cooldown for recipient (to)", async () => {
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 60); // 60s cooldown

    await vibe.connect(a).transfer(b.address, 10n);
    await expect(vibe.connect(c).transfer(b.address, 1n)).to.be.revertedWith(
      "Cooldown to"
    );
  });

  it("updates fee rates and rejects excessive total", async () => {
    await expect(vibe.setFees(600, 300, 200)).to.be.revertedWith(
      "Total fee too high"
    );
    await vibe.setFees(100, 100, 100);
    expect(await vibe.burnRate()).to.equal(100);
    expect(await vibe.daoRate()).to.equal(100);
    expect(await vibe.reflectRate()).to.equal(100);
  });

  it("setLimits emits and rejects bad limits", async () => {
    await expect(vibe.setLimits(0, 1n, 0)).to.be.revertedWith("Bad limits");
    await expect(vibe.setLimits(1n, 1n, 0)).to.emit(vibe, "LimitsUpdated");
  });

  it("skips limits when either side is excludedFromLimits", async () => {
    // trading off, but should still succeed due to exclusion
    await vibe.setExcludedFromLimits(a.address, true);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });

  it("no fee path when fees are disabled", async () => {
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe.setFeesEnabled(false);
    const amount = ethers.parseUnits("1000", 18);
    const bBefore = await vibe.balanceOf(b.address);
    const tx = vibe.connect(a).transfer(b.address, amount);
    await expect(tx).to.not.emit(vibe, "FeesDistributed");
    const bAfter = await vibe.balanceOf(b.address);
    expect(bAfter - bBefore).to.equal(amount);
  });

  it("excludedFromFees avoids fee collection", async () => {
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe.setExcludedFromFees(a.address, true);
    const amount = ethers.parseUnits("500", 18);
    const bBefore = await vibe.balanceOf(b.address);
    const tx = vibe.connect(a).transfer(b.address, amount);
    await expect(tx).to.not.emit(vibe, "FeesDistributed");
    const bAfter = await vibe.balanceOf(b.address);
    expect(bAfter - bBefore).to.equal(amount);
  });

  it("only owner can manage admin actions", async () => {
    await expect(
      vibe.connect(a).setBlacklist(b.address, true)
    ).to.be.revertedWithCustomError(vibe, "OwnableUnauthorizedAccount");

    await expect(
      vibe.connect(a).setFees(0, 0, 0)
    ).to.be.revertedWithCustomError(vibe, "OwnableUnauthorizedAccount");
  });

  it("blacklist blocks both send and receive", async () => {
    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    await vibe.setBlacklist(a.address, true);
    await expect(vibe.connect(a).transfer(b.address, 1)).to.be.revertedWith(
      "Blacklisted"
    );

    await vibe.setBlacklist(a.address, false);
    await vibe.setBlacklist(b.address, true);
    await expect(vibe.connect(a).transfer(b.address, 1)).to.be.revertedWith(
      "Blacklisted"
    );
  });

  it("exclusion flags emit events", async () => {
    await expect(vibe.setExcludedFromFees(a.address, true))
      .to.emit(vibe, "ExcludedFromFees")
      .withArgs(a.address, true);

    await expect(vibe.setExcludedFromLimits(a.address, true))
      .to.emit(vibe, "ExcludedFromLimits")
      .withArgs(a.address, true);
  });

  it("claimDividends reverts when nothing to claim", async function () {
    if (!vibe.claimDividends) return this.skip();
    await expect(vibe.connect(a).claimDividends()).to.be.revertedWith("Nothing to claim");
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { scheduleAndExecuteFees, scheduleAndExecuteLimits, scheduleAndExecuteDao, increaseTime } = require("./helpers/admin");

async function deployVibe(signers) {
  const [deployer, dao, staking, fairLaunch, influencer] = signers;
  const Vibe = await ethers.getContractFactory("VibeToken");
  const ctor = Vibe.interface.fragments.find((f) => f.type === "constructor");
  const argc = (ctor && ctor.inputs && ctor.inputs.length) || 0;
  if (argc >= 4) return Vibe.deploy(dao.address, staking.address, fairLaunch.address, influencer.address);
  if (argc === 2) return Vibe.deploy(dao.address, deployer.address);
  if (argc === 1) return Vibe.deploy(dao.address);
  return Vibe.deploy();
}

async function isHolder(vibe, addr) {
  const count = Number(await vibe.getHolderCount());
  for (let i = 0; i < count; i++) {
    if ((await vibe.getHolderAt(i)) === addr) return true;
  }
  return false;
}

describe("VibeToken – edge cases", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b, c;
  let vibe;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b, c] = await ethers.getSigners();
    vibe = await deployVibe([deployer, dao, staking, fairLaunch, influencer]);

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await scheduleAndExecuteLimits(vibe, full, full, 0);

    await vibe.transfer(a.address, ethers.parseUnits("100000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("100000", 18));
  });

  it("setDAO rejects zero address", async () => {
    await expect(vibe.scheduleDAO(ethers.ZeroAddress)).to.be.revertedWith("Zero");
  });

  it("setFees allows exactly 10% total", async () => {
    await scheduleAndExecuteFees(vibe, 500, 300, 200); // 1000 bps
    expect(await vibe.getTotalFeeRate()).to.equal(1000);
  });

  it("transfer to zero address reverts", async () => {
    await expect(vibe.connect(a).transfer(ethers.ZeroAddress, 1n)).to.be.reverted;
  });

  it("transferFrom respects trading toggle and exclusions", async () => {
    // Disable trading and remove limits so only trading toggle blocks
    const Vibe = await ethers.getContractFactory("VibeToken");
    const fresh = await Vibe.deploy(dao.address, staking.address, fairLaunch.address, influencer.address);
    await fresh.transfer(a.address, ethers.parseUnits("10", 18));

    const amount = ethers.parseUnits("10", 18);
    await fresh.connect(a).approve(b.address, amount);

    await expect(
      fresh.connect(b).transferFrom(a.address, c.address, amount)
    ).to.be.revertedWith("Trading off");

    await fresh.setExcludedFromLimits(a.address, true);
    await expect(
      fresh.connect(b).transferFrom(a.address, c.address, amount)
    ).to.not.be.reverted;
  });

  it("transferFrom enforces maxWallet", async () => {
    const maxTx = ethers.parseUnits("1000", 18);
    const maxWallet = ethers.parseUnits("200", 18);
    await scheduleAndExecuteLimits(vibe, maxTx, maxWallet, 0);

    // reduce c to 0 and approve a -> b -> c transfer
    const amount = ethers.parseUnits("200", 18);
    await vibe.connect(a).approve(b.address, amount);

    // top c near cap then attempt to exceed with transferFrom
    await vibe.connect(deployer).transfer(c.address, ethers.parseUnits("150", 18));

    await expect(
      vibe.connect(b).transferFrom(a.address, c.address, amount)
    ).to.be.revertedWith("Wallet cap");
  });

  it("self-transfer applies fees when enabled", async () => {
    await vibe.setExcludedFromFees(a.address, false);

    const amount = ethers.parseUnits("1000", 18);
    const feeDen = 10_000n;
    const burn = BigInt(await vibe.burnRate());
    const daoFee = BigInt(await vibe.daoRate());
    const ref = BigInt(await vibe.reflectRate());
    const totalFee = (amount * (burn + daoFee + ref)) / feeDen;

    const balBefore = await vibe.balanceOf(a.address);
    await expect(vibe.connect(a).transfer(a.address, amount)).to.emit(vibe, "FeesDistributed");
    const balAfter = await vibe.balanceOf(a.address);

    expect(balBefore - balAfter).to.equal(totalFee);
  });

  it("tiny transfer with fees enabled still transfers amount", async () => {
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);

    const amount = 1n; // 1 wei
    const bBefore = await vibe.balanceOf(b.address);
    await expect(vibe.connect(a).transfer(b.address, amount)).to.not.be.reverted;
    const bAfter = await vibe.balanceOf(b.address);

    expect(bAfter - bBefore).to.equal(amount);
  });

  it("cooldown set to zero allows immediate successive transfers", async () => {
    await scheduleAndExecuteLimits(vibe, await vibe.TOTAL_SUPPLY(), await vibe.TOTAL_SUPPLY(), 0);
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });

  it("holder set removes address when balance drops below threshold", async () => {
    const aBal = await vibe.balanceOf(a.address);
    expect(await isHolder(vibe, a.address)).to.equal(true);

    await vibe.setMinTokensForDividends(aBal + 1n);
    await vibe.connect(a).transfer(b.address, 1n); // trigger update

    expect(await isHolder(vibe, a.address)).to.equal(false);
  });

  it("fee scheduling enforces delay and caps", async () => {
    await expect(vibe.scheduleFees(600, 300, 200)).to.be.revertedWith("Burn fee too high");
    await expect(vibe.scheduleFees(600, 0, 0)).to.be.revertedWith("Burn fee too high");

    await vibe.scheduleFees(200, 200, 100);
    await expect(vibe.executeFees()).to.be.revertedWith("Too early");
    const delay = await vibe.ADMIN_DELAY();
    await increaseTime(delay);
    await expect(vibe.executeFees()).to.not.be.reverted;
  });

  it("fee freeze prevents future changes", async () => {
    await vibe.freezeFees();
    await expect(vibe.scheduleFees(100, 100, 100)).to.be.revertedWith("Fees frozen");
  });

  it("limits scheduling enforces delay", async () => {
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.scheduleLimits(full, full, 0);
    await expect(vibe.executeLimits()).to.be.revertedWith("Too early");
    const delay = await vibe.ADMIN_DELAY();
    await increaseTime(delay);
    await expect(vibe.executeLimits()).to.emit(vibe, "LimitsUpdated");
  });

  it("DAO change requires delay", async () => {
    await vibe.scheduleDAO(b.address);
    await expect(vibe.executeDAO()).to.be.revertedWith("Too early");
    const delay = await vibe.ADMIN_DELAY();
    await increaseTime(delay);
    await vibe.executeDAO();
    expect(await vibe.daoWallet()).to.equal(b.address);
  });

  it("trading enable is one-way", async () => {
    const Vibe = await ethers.getContractFactory("VibeToken");
    const fresh = await Vibe.deploy(dao.address, staking.address, fairLaunch.address, influencer.address);
    await fresh.setTradingEnabled(true);
    await expect(fresh.setTradingEnabled(false)).to.be.revertedWith("Trading can only be enabled");
    await expect(fresh.setTradingEnabled(true)).to.be.revertedWith("Already enabled");
  });

  it("pause/unpause blocks transfers", async () => {
    await scheduleAndExecuteLimits(vibe, await vibe.TOTAL_SUPPLY(), await vibe.TOTAL_SUPPLY(), 0);
    await vibe.pause();
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.be.reverted;
    await vibe.unpause();
    await expect(vibe.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });

  it("pendingRewards matches dividendsOwing", async function () {
    if (!vibe.pendingRewards || !vibe.dividendsOwing) return this.skip();
    await vibe.setExcludedFromFees(a.address, false);
    await vibe.setExcludedFromFees(b.address, false);
    await vibe.connect(a).transfer(b.address, ethers.parseUnits("1000", 18));
    expect(await vibe.pendingRewards(a.address)).to.equal(await vibe.dividendsOwing(a.address));
  });

  it("rescueERC20 blocks rescuing VIBE", async () => {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mock = await MockERC20.deploy("Mock", "MOCK", ethers.parseUnits("1000", 18));
    await mock.transfer(await vibe.getAddress(), ethers.parseUnits("100", 18));
    await expect(vibe.rescueERC20(await vibe.getAddress(), a.address, 1n)).to.be.revertedWith("Cannot rescue VIBE");
    await expect(vibe.rescueERC20(await mock.getAddress(), a.address, ethers.parseUnits("10", 18))).to.not.be.reverted;
  });

  it("relaxLimits only relaxes after launch", async () => {
    const maxTx = ethers.parseUnits("1000", 18);
    const maxWallet = ethers.parseUnits("1000", 18);
    await scheduleAndExecuteLimits(vibe, maxTx, maxWallet, 30);

    await expect(vibe.relaxLimits(maxTx - 1n, maxWallet, 30)).to.be.revertedWith("maxTx only increase");
    await expect(vibe.relaxLimits(maxTx, maxWallet - 1n, 30)).to.be.revertedWith("maxWallet only increase");
    await expect(vibe.relaxLimits(maxTx, maxWallet, 31)).to.be.revertedWith("cooldown only decrease");

    await expect(vibe.relaxLimits(maxTx + 1n, maxWallet + 1n, 0)).to.not.be.reverted;
  });
});

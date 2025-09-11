const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken – randomized transfers (property tests)", function () {
  let deployer, dao, staking, fairLaunch, influencer, a, b, c;
  let vibe;

  const DEAD = "0x000000000000000000000000000000000000dEaD";

  const A = 1664525n;
  const C = 1013904223n;
  const M = 0xffffffffn;

  function rnd(max, seed) {
    // simple deterministic LCG for reproducibility (number output)
    const bmax = BigInt(max);
    seed.v = (seed.v * A + C) % M;
    return Number(seed.v % bmax);
  }

  function rndBig(max, seed) {
    // BigInt random in [0, max)
    if (max <= 1n) return 0n;
    seed.v = (seed.v * A + C) % M;
    return seed.v % max;
  }

  async function sumKnownBalances(contract, addrs) {
    let sum = 0n;
    for (const addr of addrs) {
      sum += await contract.balanceOf(addr);
    }
    return sum;
  }

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, a, b, c] =
      await ethers.getSigners();

    const Vibe = await ethers.getContractFactory("VibeToken");
    vibe = await Vibe.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address
    );

    await vibe.setTradingEnabled(true);
    const full = await vibe.TOTAL_SUPPLY();
    await vibe.setLimits(full, full, 0);

    // seed participants
    await vibe.transfer(a.address, ethers.parseUnits("200000", 18));
    await vibe.transfer(b.address, ethers.parseUnits("200000", 18));
    await vibe.transfer(c.address, ethers.parseUnits("200000", 18));
  });

  it("preserves supply and fee accounting across randomized transfers", async () => {
    const participants = [deployer, a, b, c];
    const contractAddr = await vibe.getAddress();
    const total = await vibe.totalSupply();

    const feeDen = 10_000n;
    const burnRate = BigInt(await vibe.burnRate());
    const daoRate = BigInt(await vibe.daoRate());
    const reflectRate = BigInt(await vibe.reflectRate());

    const seed = { v: 0xdeadbeefn };
    for (let i = 0; i < 20; i++) {
      // Randomly toggle global fees ~30% probability
      if (rnd(10, seed) < 3) {
        const enabled = rnd(2, seed) === 1;
        await vibe.connect(deployer).setFeesEnabled(enabled);
      }

      // Randomly toggle exclusions for endpoints
      const si = rnd(participants.length, seed);
      const ti = rnd(participants.length, seed);
      const sender = participants[si];
      const receiver = participants[ti === si ? (ti + 1) % participants.length : ti];

      const bal = await vibe.balanceOf(sender.address);
      if (bal === 0n) continue;

      // amount between 1 and ~10% of balance
      const max = bal / 10n || 1n;
      const amt = 1n + rndBig(max, seed);

      const exSender = rnd(2, seed) === 1;
      const exReceiver = rnd(2, seed) === 1;
      await vibe.setExcludedFromFees(sender.address, exSender);
      await vibe.setExcludedFromFees(receiver.address, exReceiver);

      const bDao0 = await vibe.balanceOf(dao.address);
      const bDead0 = await vibe.balanceOf(DEAD);
      const bThis0 = await vibe.balanceOf(contractAddr);

      const bRecv0 = await vibe.balanceOf(receiver.address);

      const feesEnabled = await vibe.feesEnabled();
      const willTakeFee = feesEnabled && !exSender && !exReceiver;

      const tx = vibe.connect(sender).transfer(receiver.address, amt);
      if (willTakeFee) {
        const burn = (amt * burnRate) / feeDen;
        const daoF = (amt * daoRate) / feeDen;
        const totalFee = (amt * (burnRate + daoRate + reflectRate)) / feeDen;
        const refF = totalFee - burn - daoF; // match contract's rounding behavior
        await expect(tx)
          .to.emit(vibe, "FeesDistributed")
          .withArgs(burn, daoF, refF);
        await tx;
        const bRecv1 = await vibe.balanceOf(receiver.address);
        expect(bRecv1 - bRecv0).to.equal(amt - (burn + daoF + refF));
        expect((await vibe.balanceOf(dao.address)) - bDao0).to.equal(daoF);
        expect((await vibe.balanceOf(DEAD)) - bDead0).to.equal(burn);
        expect((await vibe.balanceOf(contractAddr)) - bThis0).to.equal(refF);
      } else {
        await expect(tx).to.not.emit(vibe, "FeesDistributed");
        await tx;
        const bRecv1 = await vibe.balanceOf(receiver.address);
        expect(bRecv1 - bRecv0).to.equal(amt);
      }

      // Supply conservation across known addresses
      const sum = await sumKnownBalances(vibe, [
        deployer.address,
        a.address,
        b.address,
        c.address,
        dao.address,
        DEAD,
        contractAddr,
      ]);
      expect(sum).to.equal(total);
    }
  });
});

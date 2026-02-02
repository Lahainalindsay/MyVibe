const { ethers } = require("hardhat");

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

async function scheduleAndExecuteFees(vibe, burn, dao, reflect) {
  await vibe.scheduleFees(burn, dao, reflect);
  const delay = await vibe.ADMIN_DELAY();
  await increaseTime(delay);
  await vibe.executeFees();
}

async function scheduleAndExecuteLimits(vibe, maxTx, maxWallet, cooldown) {
  await vibe.scheduleLimits(maxTx, maxWallet, cooldown);
  const delay = await vibe.ADMIN_DELAY();
  await increaseTime(delay);
  await vibe.executeLimits();
}

async function scheduleAndExecuteDao(vibe, addr) {
  await vibe.scheduleDAO(addr);
  const delay = await vibe.ADMIN_DELAY();
  await increaseTime(delay);
  await vibe.executeDAO();
}

module.exports = {
  increaseTime,
  scheduleAndExecuteFees,
  scheduleAndExecuteLimits,
  scheduleAndExecuteDao,
};

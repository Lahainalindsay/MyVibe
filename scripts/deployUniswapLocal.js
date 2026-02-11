/* eslint-disable no-console */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function upsertEnv(contents, key, value) {
  const lineRe = new RegExp(`^${key}=.*$`, "m");
  if (lineRe.test(contents)) {
    return contents.replace(lineRe, `${key}=${value}`);
  }
  const suffix = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
  return `${contents}${suffix}${key}=${value}\n`;
}

async function waitDeployed(contract) {
  if (contract.waitForDeployment) return contract.waitForDeployment();
  if (contract.deployed) return contract.deployed();
  return undefined;
}

async function getAddress(contract) {
  if (contract.getAddress) return contract.getAddress();
  return contract.address;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");
  console.log("🚀 Deployer:", deployer.address);

  const WETH9 = await hre.ethers.getContractFactory("WETH9");
  const weth = await WETH9.deploy();
  await waitDeployed(weth);
  const wethAddr = await getAddress(weth);
  console.log("✅ WETH9:", wethAddr);

  const Factory = await hre.ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy();
  await waitDeployed(factory);
  const factoryAddr = await getAddress(factory);
  console.log("✅ UniswapV2Factory:", factoryAddr);

  const Router = await hre.ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(factoryAddr, wethAddr);
  await waitDeployed(router);
  const routerAddr = await getAddress(router);
  console.log("✅ UniswapV2Router02:", routerAddr);

  const envPath = path.resolve(__dirname, "..", ".env");
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  let next = current;
  next = upsertEnv(next, "WETH_ADDRESS", wethAddr);
  next = upsertEnv(next, "FACTORY_ADDRESS", factoryAddr);
  next = upsertEnv(next, "ROUTER_ADDRESS", routerAddr);
  if (next !== current) {
    fs.writeFileSync(envPath, next, "utf8");
    console.log("✅ .env updated with WETH/FACTORY/ROUTER addresses");
  } else {
    console.log("ℹ️ .env already up to date");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

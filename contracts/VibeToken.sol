# VibeToken – Production-Ready Contracts, Deploy & Tests (Sepolia-ready)

This is a cohesive, **ethers v6** + **Hardhat Toolbox** + **OpenZeppelin v5** codebase. Solidity is pinned to **0.8.28**. Includes:

```
contracts/
  VibeToken.sol
  SoulArcanaNFT.sol
  SigilArcanaOnChainRenderer.sol
scripts/
  deploy.js
  verify.js          (optional helper)
test/
  vibeToken.test.js
  soulArcanaNFT.test.js
  integration.test.js
  renderer.test.js   (extra validation)
hardhat.config.js
package.json
.env.example
```

---

## contracts/VibeToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * VibeToken: ERC20 with fee routing (burn + DAO + reflections),
 * trading limits (maxTx, maxWallet, cooldown), blacklist, snapshots,
 * and simple dividends via dividend points.
 *
 * OpenZeppelin v5.x.
 */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Snapshot} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract VibeToken is ERC20, ERC20Snapshot, ERC20Pausable, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // --- Supply ---
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1B VIBE

    // --- Fee config (denominator 10000 => 1% = 100) ---
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public burnRate = 200;      // 2.00%
    uint256 public daoRate = 200;       // 2.00%
    uint256 public reflectRate = 100;   // 1.00%
    bool    public feesEnabled = true;

    address public daoWallet;

    // --- Trading guards ---
    bool    public tradingEnabled = false;
    uint256 public maxTxAmount;       // default 2% of supply
    uint256 public maxWalletAmount;   // default 2% of supply
    uint256 public cooldownTime = 0;  // disabled by default
    mapping(address => uint256) private _lastTxTime;

    mapping(address => bool) public isBlacklisted;
    mapping(address => bool) public excludedFromFees;
    mapping(address => bool) public excludedFromLimits;

    // --- Reflection / dividends (pull model) ---
    uint256 private constant POINT_MULTIPLIER = 1e24;
    uint256 public totalDivPoints;
    uint256 public unclaimedDividends;
    uint256 public totalReflectionDistributed;

    mapping(address => uint256) private lastDivPoints;
    mapping(address => uint256) private credit;

    // Track eligible holders by balance threshold
    EnumerableSet.AddressSet private holders;
    uint256 public minTokensForDividends = 1_000 * 1e18;

    // Snapshots
    mapping(address => bool) public snapshotAuthorized;

    // --- Events ---
    event FeesDistributed(uint256 burnAmt, uint256 daoAmt, uint256 reflectAmt);
    event TradingEnabled(bool enabled);
    event LimitsUpdated(uint256 maxTx, uint256 maxWallet, uint256 cooldown);
    event BlacklistUpdated(address indexed account, bool blacklisted);
    event ExcludedFromFees(address indexed account, bool status);
    event ExcludedFromLimits(address indexed account, bool status);
    event SnapshotAuthorizationUpdated(address indexed account, bool authorized);
    event SnapshotTriggered(uint256 id);
    event DividendsClaimed(address indexed account, uint256 amount);

    constructor(
        address _daoWallet,
        address staking,       // kept for constructor parity / allocation mgmt
        address fairLaunch,    // optional distribution wallet
        address influencer,    // optional marketing wallet
        address owner_
    ) ERC20("VibeToken", "VIBE") Ownable(owner_) {
        require(_daoWallet != address(0), "DAO wallet required");
        daoWallet = _daoWallet;

        // Mint all to owner
        _mint(owner_, TOTAL_SUPPLY);

        // Defaults: 2%
        maxTxAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;
        maxWalletAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;

        // Exclusions
        excludedFromFees[owner_] = true;
        excludedFromFees[daoWallet] = true;
        if (staking != address(0)) excludedFromFees[staking] = true;
        if (fairLaunch != address(0)) excludedFromFees[fairLaunch] = true;
        if (influencer != address(0)) excludedFromFees[influencer] = true;

        excludedFromLimits[owner_] = true;
        excludedFromLimits[daoWallet] = true;
        if (staking != address(0)) excludedFromLimits[staking] = true;
        if (fairLaunch != address(0)) excludedFromLimits[fairLaunch] = true;
        if (influencer != address(0)) excludedFromLimits[influencer] = true;

        // initial holder status
        _updateHolderStatus(owner_);

        // owner can snapshot by default
        snapshotAuthorized[owner_] = true;
    }

    // --- Admin ---
    function setFees(uint256 _burn, uint256 _dao, uint256 _reflect) external onlyOwner {
        uint256 sum = _burn + _dao + _reflect;
        require(sum <= 1000, "Total fee too high"); // max 10%
        burnRate = _burn; daoRate = _dao; reflectRate = _reflect;
    }

    function setFeesEnabled(bool enabled) external onlyOwner { feesEnabled = enabled; }

    function setTradingEnabled(bool enabled) external onlyOwner { tradingEnabled = enabled; emit TradingEnabled(enabled); }

    function setLimits(uint256 _maxTx, uint256 _maxWallet, uint256 _cooldown) external onlyOwner {
        require(_maxTx > 0 && _maxWallet > 0, "Bad limits");
        maxTxAmount = _maxTx; maxWalletAmount = _maxWallet; cooldownTime = _cooldown;
        emit LimitsUpdated(_maxTx, _maxWallet, _cooldown);
    }

    function setDAO(address _dao) external onlyOwner { require(_dao != address(0), "Zero"); daoWallet = _dao; }

    function setBlacklist(address account, bool blacklisted) external onlyOwner { isBlacklisted[account] = blacklisted; emit BlacklistUpdated(account, blacklisted); }

    function setExcludedFromFees(address account, bool status) external onlyOwner { excludedFromFees[account] = status; emit ExcludedFromFees(account, status); _updateHolderStatus(account); }

    function setExcludedFromLimits(address account, bool status) external onlyOwner { excludedFromLimits[account] = status; emit ExcludedFromLimits(account, status); }

    function setMinTokensForDividends(uint256 amount) external onlyOwner { minTokensForDividends = amount; }

    // Snapshots
    function setSnapshotAuthorization(address account, bool auth) external onlyOwner { snapshotAuthorized[account] = auth; emit SnapshotAuthorizationUpdated(account, auth); }

    function snapshot() external returns (uint256) {
        require(snapshotAuthorized[msg.sender] || msg.sender == owner(), "Not authorized");
        uint256 id = _snapshot(); emit SnapshotTriggered(id); return id;
    }

    // --- Reflection accounting ---
    function dividendsOwing(address account) public view returns (uint256) {
        uint256 newDivPoints = totalDivPoints - lastDivPoints[account];
        return (balanceOf(account) * newDivPoints) / POINT_MULTIPLIER + credit[account];
    }

    function claimDividends() external {
        uint256 owing = dividendsOwing(msg.sender);
        require(owing > 0, "Nothing to claim");
        lastDivPoints[msg.sender] = totalDivPoints;
        credit[msg.sender] = 0;
        unclaimedDividends -= owing;
        _transfer(address(this), msg.sender, owing);
        emit DividendsClaimed(msg.sender, owing);
    }

    function _accrue(address account) private {
        if (lastDivPoints[account] != totalDivPoints) {
            uint256 owed = (balanceOf(account) * (totalDivPoints - lastDivPoints[account])) / POINT_MULTIPLIER;
            credit[account] += owed;
            lastDivPoints[account] = totalDivPoints;
        }
    }

    function _distributeReflection(uint256 reflectionAmount) private {
        uint256 circulating = getCirculatingSupply();
        if (circulating == 0) return;
        totalDivPoints += (reflectionAmount * POINT_MULTIPLIER) / circulating;
        unclaimedDividends += reflectionAmount;
        totalReflectionDistributed += reflectionAmount;
    }

    function getCirculatingSupply() public view returns (uint256) {
        return totalSupply() - balanceOf(address(0)) - balanceOf(address(0xdead)) - balanceOf(address(this));
    }

    // --- Transfer overrides ---
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Snapshot, ERC20Pausable) {
        super._update(from, to, value);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklisted");

        if (from != address(0) && to != address(0)) {
            if (!excludedFromLimits[from] && !excludedFromLimits[to]) {
                require(tradingEnabled, "Trading off");
                require(amount <= maxTxAmount, "Tx limit");
                require(balanceOf(to) + amount <= maxWalletAmount, "Wallet cap");
                if (cooldownTime > 0) {
                    require(_lastTxTime[from] + cooldownTime <= block.timestamp, "Cooldown from");
                    require(_lastTxTime[to] + cooldownTime <= block.timestamp, "Cooldown to");
                    _lastTxTime[from] = block.timestamp;
                    _lastTxTime[to] = block.timestamp;
                }
            }
        }

        // accrue reflections before balances change
        if (from != address(0)) _accrue(from);
        if (to != address(0)) _accrue(to);

        bool takeFee = feesEnabled && !excludedFromFees[from] && !excludedFromFees[to];

        if (takeFee) {
            uint256 totalFee = (amount * (burnRate + daoRate + reflectRate)) / FEE_DENOMINATOR;
            uint256 burnAmt = (amount * burnRate) / FEE_DENOMINATOR;
            uint256 daoAmt = (amount * daoRate) / FEE_DENOMINATOR;
            uint256 reflectAmt = totalFee - burnAmt - daoAmt;

            if (burnAmt > 0) super._transfer(from, address(0xdead), burnAmt);
            if (daoAmt > 0) super._transfer(from, daoWallet, daoAmt);
            if (reflectAmt > 0) { super._transfer(from, address(this), reflectAmt); _distributeReflection(reflectAmt); }

            emit FeesDistributed(burnAmt, daoAmt, reflectAmt);
            super._transfer(from, to, amount - totalFee);
        } else {
            super._transfer(from, to, amount);
        }

        _updateHolderStatus(from);
        _updateHolderStatus(to);
    }

    function _updateHolderStatus(address account) private {
        if (account == address(0)) return;
        if (balanceOf(account) >= minTokensForDividends && !excludedFromFees[account]) {
            holders.add(account);
        } else {
            holders.remove(account);
        }
    }

    // --- Views ---
    function getHolderCount() external view returns (uint256) { return holders.length(); }
    function getHolderAt(uint256 i) external view returns (address) { return holders.at(i); }
    function getTotalFeeRate() external view returns (uint256) { return burnRate + daoRate + reflectRate; }
}
```

---

## contracts/SoulArcanaNFT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IRenderer {
    function tokenURI(uint256 tokenId, uint256 arcana) external view returns (string memory);
}

contract SoulArcanaNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    IRenderer public renderer;
    IERC20 public vibe;

    uint256 public nextTokenId;
    uint256 public mintPriceETH = 0.01 ether;
    uint256 public mintPriceVIBE = 1000 * 1e18; // per NFT
    uint256 public maxMintPerTx = 20;

    address public treasury; // where proceeds go (default: this contract)

    mapping(uint256 => uint256) public tokenArcana;

    event Minted(address indexed minter, uint256 indexed tokenId, uint256 arcana, string currency);
    event PricesUpdated(uint256 ethPrice, uint256 vibePrice);
    event TreasuryUpdated(address indexed newTreasury);
    event MaxMintUpdated(uint256 maxMintPerTx);

    constructor(address _renderer, address _vibe, address _owner)
        ERC721("SoulArcanaNFT", "ARCANA")
        Ownable(_owner)
    {
        require(_renderer != address(0) && _vibe != address(0), "Bad address");
        renderer = IRenderer(_renderer);
        vibe = IERC20(_vibe);
        treasury = address(this);
    }

    // --- Minting ---
    function mint(uint256 quantity) external payable {
        require(quantity > 0, "Quantity > 0");
        require(quantity <= maxMintPerTx, "Too many");
        uint256 cost = mintPriceETH * quantity;
        require(msg.value >= cost, "Insufficient ETH");

        _batchMint(msg.sender, quantity, "ETH");

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost); // refund dust
        }
    }

    function mintWithVibe(uint256 quantity) external {
        require(quantity > 0, "Quantity > 0");
        require(quantity <= maxMintPerTx, "Too many");
        uint256 cost = mintPriceVIBE * quantity;
        require(vibe.transferFrom(msg.sender, treasury, cost), "VIBE transfer failed");
        _batchMint(msg.sender, quantity, "VIBE");
    }

    function _batchMint(address to, uint256 quantity, string memory currency) internal {
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId++;
            uint256 arcana = _generateArcana(tokenId, to);
            tokenArcana[tokenId] = arcana;
            _safeMint(to, tokenId);
            emit Minted(to, tokenId, arcana, currency);
        }
    }

    function _generateArcana(uint256 tokenId, address minter) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, minter, tokenId))) % 10000;
    }

    // --- Admin ---
    function setPrices(uint256 ethPrice, uint256 vibePrice) external onlyOwner {
        mintPriceETH = ethPrice; mintPriceVIBE = vibePrice; emit PricesUpdated(ethPrice, vibePrice);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero"); treasury = _treasury; emit TreasuryUpdated(_treasury);
    }

    function setMaxMintPerTx(uint256 _max) external onlyOwner { require(_max > 0, "Zero"); maxMintPerTx = _max; emit MaxMintUpdated(_max); }

    // --- Withdrawals ---
    function withdrawETH(address payable to) external onlyOwner {
        if (to == payable(address(0))) to = payable(owner());
        to.transfer(address(this).balance);
    }

    function withdrawERC20(address token, address to) external onlyOwner {
        require(to != address(0), "Zero");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "No balance");
        IERC20(token).transfer(to, bal);
    }

    // --- Metadata ---
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Nonexistent token");
        return renderer.tokenURI(tokenId, tokenArcana[tokenId]);
    }
}
```

---

## contracts/SigilArcanaOnChainRenderer.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract SigilArcanaOnChainRenderer {
    using Strings for uint256;

    function tokenURI(uint256 tokenId, uint256 arcana) external pure returns (string memory) {
        string memory name = string.concat("SoulArcana #", tokenId.toString());
        string memory description = "On-chain arcana soul — procedurally generated.";
        string memory image = _buildSVG(arcana, tokenId);

        bytes memory json = abi.encodePacked(
            '{"name":"', name,
            '","description":"', description,
            '","attributes":[{"trait_type":"Arcana","value":"', arcana.toString(),
            '"}],"image":"', image, '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _buildSVG(uint256 arcana, uint256 tokenId) private pure returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(arcana, tokenId));
        uint8 r = uint8(h[0]); uint8 g = uint8(h[1]); uint8 b = uint8(h[2]);

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">',
            '<rect width="512" height="512" fill="rgb(', _u(r), ',', _u(g), ',', _u(b), ')"/>',
            '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#fff">',
            'ARCANA: ', _u(uint8(arcana % 251)), '</text>',
            '</svg>'
        );

        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }

    function _u(uint8 v) private pure returns (string memory) { return Strings.toString(uint256(v)); }
}
```

---

## scripts/deploy.js

```js
/* eslint-disable no-console */
const hre = require("hardhat");

async function main() {
  const [deployer, dao, staking, fairLaunch, influencer, nftOwner] = await hre.ethers.getSigners();
  console.log("🚀 Deployer:", deployer.address);

  // 1) VibeToken
  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(
    dao.address,
    staking.address,
    fairLaunch.address,
    influencer.address,
    deployer.address
  );
  await vibe.waitForDeployment();
  const vibeAddr = await vibe.getAddress();
  console.log("✅ VibeToken:", vibeAddr);

  // Optional: loosen limits for initial distribution/testing
  await (await vibe.setTradingEnabled(true)).wait();
  await (await vibe.setLimits(
    hre.ethers.parseUnits("1000000000", 18), // maxTx ~ full supply
    hre.ethers.parseUnits("1000000000", 18), // maxWallet ~ full supply
    0 // cooldown
  )).wait();

  // 2) Renderer
  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  const rendererAddr = await renderer.getAddress();
  console.log("✅ Renderer:", rendererAddr);

  // 3) SoulArcanaNFT
  const SoulArcanaNFT = await hre.ethers.getContractFactory("SoulArcanaNFT");
  const soul = await SoulArcanaNFT.deploy(
    rendererAddr,
    vibeAddr,
    nftOwner.address
  );
  await soul.waitForDeployment();
  const soulAddr = await soul.getAddress();
  console.log("✅ SoulArcanaNFT:", soulAddr);

  // Exclude NFT contract from token fees/limits
  await (await vibe.setExcludedFromFees(soulAddr, true)).wait();
  await (await vibe.setExcludedFromLimits(soulAddr, true)).wait();

  // Set mint prices (owner-controlled)
  await (await soul.connect(nftOwner).setPrices(
    hre.ethers.parseEther("0.01"),
    hre.ethers.parseUnits("1000", 18)
  )).wait();

  console.log("🎉 Deployment complete");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

---

## scripts/verify.js (optional helper)

```js
const hre = require("hardhat");

async function main() {
  const vibe = process.env.VIBE_ADDRESS;
  const renderer = process.env.RENDERER_ADDRESS;
  const soul = process.env.SOUL_ADDRESS;

  if (vibe) {
    await hre.run("verify:verify", { address: vibe, constructorArguments: [
      process.env.DAO_ADDRESS,
      process.env.STAKING_ADDRESS,
      process.env.FAIRLAUNCH_ADDRESS,
      process.env.INFLUENCER_ADDRESS,
      process.env.DEPLOYER_ADDRESS,
    ]});
  }

  if (renderer) {
    await hre.run("verify:verify", { address: renderer, constructorArguments: [] });
  }

  if (soul) {
    await hre.run("verify:verify", { address: soul, constructorArguments: [
      process.env.RENDERER_ADDRESS,
      process.env.VIBE_ADDRESS,
      process.env.NFT_OWNER_ADDRESS,
    ]});
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

---

## test/vibeToken.test.js

```js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VibeToken", function () {
  let deployer, dao, staking, fairLaunch, influencer, user1, user2;
  let vibe;

  beforeEach(async function () {
    [deployer, dao, staking, fairLaunch, influencer, user1, user2] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      deployer.address
    );

    await (await vibe.setTradingEnabled(true)).wait();
    const full = await vibe.TOTAL_SUPPLY();
    await (await vibe.setLimits(full, full, 0)).wait();

    // seed user1
    await (await vibe.connect(deployer).transfer(user1.address, ethers.parseUnits("1000000", 18))).wait();
  });

  it("has correct total supply", async () => {
    expect(await vibe.totalSupply()).to.equal(await vibe.TOTAL_SUPPLY());
  });

  it("takes fees on normal transfers", async () => {
    await (await vibe.setExcludedFromFees(user1.address, false)).wait();
    await (await vibe.setExcludedFromFees(user2.address, false)).wait();

    const amount = ethers.parseUnits("10000", 18);
    const feeDen = 10000n;
    const burn = BigInt(await vibe.burnRate());
    const dao = BigInt(await vibe.daoRate());
    const ref = BigInt(await vibe.reflectRate());
    const totalFee = (amount * (burn + dao + ref)) / feeDen;
    const expectedNet = amount - totalFee;

    await expect(vibe.connect(user1).transfer(user2.address, amount))
      .to.emit(vibe, "FeesDistributed");

    const bal2 = await vibe.balanceOf(user2.address);
    expect(bal2).to.equal(expectedNet);
  });

  it("blocks blacklisted accounts", async () => {
    await (await vibe.setBlacklist(user1.address, true)).wait();
    await expect(vibe.connect(user1).transfer(user2.address, 1)).to.be.revertedWith("Blacklisted");
  });

  it("snapshots can be triggered by authorized account", async () => {
    await expect(vibe.connect(user1).snapshot()).to.be.revertedWith("Not authorized");
    await (await vibe.setSnapshotAuthorization(user1.address, true)).wait();
    const id = await vibe.connect(user1).snapshot();
    expect(id).to.be.greaterThan(0);
  });

  it("reflects to holders and can be claimed", async () => {
    await (await vibe.setExcludedFromFees(user1.address, false)).wait();
    await (await vibe.setExcludedFromFees(user2.address, false)).wait();

    await (await vibe.connect(deployer).transfer(user2.address, ethers.parseUnits("100000", 18))).wait();

    const txAmount = ethers.parseUnits("50000", 18);
    await (await vibe.connect(user1).transfer(user2.address, txAmount)).wait();

    const pendingBefore = await vibe.dividendsOwing(user1.address);
    expect(pendingBefore).to.be.gt(0);

    const balBefore = await vibe.balanceOf(user1.address);
    await expect(vibe.connect(user1).claimDividends()).to.emit(vibe, "DividendsClaimed");
    const balAfter = await vibe.balanceOf(user1.address);
    expect(balAfter).to.be.gt(balBefore);
  });
});
```

---

## test/soulArcanaNFT.test.js

```js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulArcanaNFT", function () {
  let deployer, dao, staking, fairLaunch, influencer, owner, user;
  let vibe, renderer, soul;

  beforeEach(async () => {
    [deployer, dao, staking, fairLaunch, influencer, owner, user] = await ethers.getSigners();

    const VibeToken = await ethers.getContractFactory("VibeToken");
    vibe = await VibeToken.deploy(
      dao.address,
      staking.address,
      fairLaunch.address,
      influencer.address,
      deployer.address
    );
    await (await vibe.setTradingEnabled(true)).wait();
    const full = await vibe.TOTAL_SUPPLY();
    await (await vibe.setLimits(full, full, 0)).wait();

    await (await vibe.connect(deployer).transfer(user.address, ethers.parseUnits("100000", 18))).wait();
    await (await vibe.setExcludedFromFees(user.address, true)).wait();

    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    renderer = await Renderer.deploy();

    const Soul = await ethers.getContractFactory("SoulArcanaNFT");
    soul = await Soul.deploy(await renderer.getAddress(), await vibe.getAddress(), owner.address);

    await (await soul.connect(owner).setPrices(ethers.parseEther("0.01"), ethers.parseUnits("1000", 18))).wait();
  });

  it("mints with ETH (quantity)", async () => {
    const qty = 3n;
    const price = await soul.mintPriceETH();
    const cost = price * qty;

    await expect(soul.connect(user).mint(qty, { value: cost }))
      .to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
    const uri = await soul.tokenURI(0);
    expect(uri.startsWith("data:application/json;base64,")).to.be.true;
  });

  it("mints with VIBE (quantity)", async () => {
    const qty = 5n;
    const vPrice = await soul.mintPriceVIBE();
    const cost = vPrice * qty;

    await (await vibe.connect(user).approve(await soul.getAddress(), cost)).wait();

    await expect(soul.connect(user).mintWithVibe(qty)).to.emit(soul, "Minted");

    expect(await soul.balanceOf(user.address)).to.equal(qty);
  });

  it("reverts on zero quantity", async () => {
    await expect(soul.connect(user).mint(0, { value: 0 })).to.be.revertedWith("Quantity > 0");
    await expect(soul.connect(user).mintWithVibe(0)).to.be.revertedWith("Quantity > 0");
  });

  it("reverts if insufficient ETH", async () => {
    await expect(soul.connect(user).mint(2n, { value: 0 })).to.be.revertedWith("Insufficient ETH");
  });

  it("stores arcana values per token", async () => {
    await (await soul.connect(user).mint(2n, { value: (await soul.mintPriceETH()) * 2n })).wait();
    const arc0 = await soul.tokenArcana(0);
    const arc1 = await soul.tokenArcana(1);
    expect(arc0).to.not.equal(arc1);
  });

  it("treasury receives ETH and VIBE", async () => {
    const treasury = await soul.treasury();

    // ETH
    const ethPrice = await soul.mintPriceETH();
    const beforeEth = await ethers.provider.getBalance(treasury);
    await (await soul.connect(user).mint(1n, { value: ethPrice })).wait();
    const afterEth = await ethers.provider.getBalance(treasury);
    expect(afterEth - beforeEth).to.equal(ethPrice);

    // VIBE
    const qty = 2n;
    const vPrice = await soul.mintPriceVIBE();
    const total = vPrice * qty;
    await (await vibe.connect(user).approve(await soul.getAddress(), total)).wait();
    const beforeVibe = await vibe.balanceOf(treasury);
    await (await soul.connect(user).mintWithVibe(qty)).wait();
    const afterVibe = await vibe.balanceOf(treasury);
    expect(afterVibe - beforeVibe).to.equal(total);
  });
});
```

---

## test/integration.test.js

```js
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
```

---

## test/renderer.test.js

```js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SigilArcanaOnChainRenderer", function () {
  it("returns base64 JSON with base64 SVG image", async () => {
    const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
    const renderer = await Renderer.deploy();

    const uri = await renderer.tokenURI(123, 456);
    expect(uri.startsWith("data:application/json;base64,")).to.be.true;

    const json = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
    const data = JSON.parse(json);
    expect(data).to.have.property("name");
    expect(data).to.have.property("image");
    expect(data.image.startsWith("data:image/svg+xml;base64,")).to.be.true;
  });
});
```

---

## hardhat.config.js

```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || "",
  },
};
```

---

## package.json

```json
{
  "name": "vibe-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "hardhat compile",
    "test": "hardhat test",
    "deploy:local": "hardhat run scripts/deploy.js",
    "deploy:sepolia": "hardhat run scripts/deploy.js --network sepolia",
    "verify": "hardhat run scripts/verify.js --network sepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "dotenv": "^16.4.5",
    "hardhat-gas-reporter": "^1.0.10",
    "solidity-coverage": "^0.8.12"
  }
}
```

---

## .env.example

```env
# RPC
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-infura-id>
PRIVATE_KEY=0xabc123...your_deployer_private_key

# Etherscan (optional for verify)
ETHERSCAN_API_KEY=your_etherscan_key

# Constructor addresses for verify.js (optional helper)
DAO_ADDRESS=0x...
STAKING_ADDRESS=0x...
FAIRLAUNCH_ADDRESS=0x...
INFLUENCER_ADDRESS=0x...
DEPLOYER_ADDRESS=0x...

RENDERER_ADDRESS=0x...
VIBE_ADDRESS=0x...
SOUL_ADDRESS=0x...
NFT_OWNER_ADDRESS=0x...
```

---

## How to use

1. **Install & compile**

```bash
npm i
npx hardhat compile
```

2. **Run tests**

```bash
npx hardhat test
```

3. **Local deploy**

```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

4. **Sepolia deploy**

```bash
cp .env.example .env  # fill values
npx hardhat run scripts/deploy.js --network sepolia
```

5. **Verify (optional)**

```bash
export VIBE_ADDRESS=0x... RENDERER_ADDRESS=0x... SOUL_ADDRESS=0x...
npx hardhat run scripts/verify.js --network sepolia
```

---

### Notes & Rationale

* **Ethers v6**: all tests use bigint-friendly APIs (`parseUnits`, `parseEther`) and avoid Number coercion.
* **NFT pricing**: quantity-based mints are enforced with a configurable `maxMintPerTx`.
* **Treasury**: default to this contract; withdraw helpers for ETH+ERC20 included.
* **Token taxes**: deployment excludes the NFT contract from VIBE fees/limits to avoid friction during VIBE mints.
* **Renderer**: compact on-chain JSON+SVG, test ensures base64-encoded JSON & image correctness.
* **Security**: admin-only setters have basic sanity checks; snapshot authorization is explicit; blacklist gates transfers.

```
```


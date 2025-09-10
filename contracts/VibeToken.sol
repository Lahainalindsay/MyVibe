// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract VibeToken is ERC20, ERC20Pausable, Ownable {
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

    // --- Events ---
    event FeesDistributed(uint256 burnAmt, uint256 daoAmt, uint256 reflectAmt);
    event TradingEnabled(bool enabled);
    event LimitsUpdated(uint256 maxTx, uint256 maxWallet, uint256 cooldown);
    event BlacklistUpdated(address indexed account, bool blacklisted);
    event ExcludedFromFees(address indexed account, bool status);
    event ExcludedFromLimits(address indexed account, bool status);
    event DividendsClaimed(address indexed account, uint256 amount);

    constructor(
        address _daoWallet,
        address staking,       // kept for constructor parity / allocation mgmt
        address fairLaunch,    // optional distribution wallet
        address influencer    // optional marketing wallet
    ) ERC20("VibeToken", "VIBE") {
        require(_daoWallet != address(0), "DAO wallet required");
        daoWallet = _daoWallet;

        // Mint all to deployer (owner is msg.sender in OZ v4)
        _mint(msg.sender, TOTAL_SUPPLY);

        // Defaults: 2%
        maxTxAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;
        maxWalletAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;

        // Exclusions
        excludedFromFees[msg.sender] = true;
        excludedFromFees[daoWallet] = true;
        if (staking != address(0)) excludedFromFees[staking] = true;
        if (fairLaunch != address(0)) excludedFromFees[fairLaunch] = true;
        if (influencer != address(0)) excludedFromFees[influencer] = true;

        excludedFromLimits[msg.sender] = true;
        excludedFromLimits[daoWallet] = true;
        if (staking != address(0)) excludedFromLimits[staking] = true;
        if (fairLaunch != address(0)) excludedFromLimits[fairLaunch] = true;
        if (influencer != address(0)) excludedFromLimits[influencer] = true;

        // initial holder status
        _updateHolderStatus(msg.sender);
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

    // --- Transfer hooks ---
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._beforeTokenTransfer(from, to, amount);
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

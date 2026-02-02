// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract VibeToken is ERC20, ERC20Pausable, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // --- Supply ---
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1B VIBE

    // --- Fee config (denominator 10000 => 1% = 100) ---
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant MAX_TOTAL_FEE = 1_000; // 10%
    uint256 public constant MAX_BURN_FEE = 500; // 5%
    uint256 public constant MAX_DAO_FEE = 500; // 5%
    uint256 public constant MAX_REFLECTION_FEE = 500; // 5%

    uint256 public burnRate = 200;      // 2.00%
    uint256 public daoRate = 200;       // 2.00%
    uint256 public reflectRate = 100;   // 1.00%
    bool    public feesEnabled = true;
    bool    public feesFrozen = false;

    address public daoWallet;

    // --- Trading guards ---
    bool    public tradingEnabled = false;
    uint256 public maxTxAmount;       // default 2% of supply
    uint256 public maxWalletAmount;   // default 2% of supply
    uint256 public cooldownTime = 0;  // disabled by default
    uint256 public launchTime = 0;    // set when trading is enabled
    mapping(address => uint256) private _lastTxTime;

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

    // --- Admin delay ---
    uint256 public constant ADMIN_DELAY = 24 hours;

    struct PendingFees {
        uint256 burn;
        uint256 dao;
        uint256 reflect;
        uint256 eta;
        bool queued;
    }

    struct PendingLimits {
        uint256 maxTx;
        uint256 maxWallet;
        uint256 cooldown;
        uint256 eta;
        bool queued;
    }

    struct PendingAddress {
        address value;
        uint256 eta;
        bool queued;
    }

    PendingFees public pendingFees;
    PendingLimits public pendingLimits;
    PendingAddress public pendingDao;

    // --- Events ---
    event FeesDistributed(uint256 burnAmt, uint256 daoAmt, uint256 reflectAmt);
    event TradingEnabled(bool enabled);
    event LimitsUpdated(uint256 maxTx, uint256 maxWallet, uint256 cooldown);
    event ExcludedFromFees(address indexed account, bool status);
    event ExcludedFromLimits(address indexed account, bool status);
    event DividendsClaimed(address indexed account, uint256 amount);
    event Claim(address indexed holder, uint256 amount);
    event ReflectionAccrued(uint256 amount);

    event ChangeScheduled(bytes32 indexed what, uint256 value, uint256 eta);
    event ChangeExecuted(bytes32 indexed what, uint256 value);
    event ChangeScheduledAddress(bytes32 indexed what, address value, uint256 eta);
    event ChangeExecutedAddress(bytes32 indexed what, address value);

    event FeesScheduled(uint256 burn, uint256 dao, uint256 reflect, uint256 eta);
    event FeesExecuted(uint256 burn, uint256 dao, uint256 reflect);
    event LimitsScheduled(uint256 maxTx, uint256 maxWallet, uint256 cooldown, uint256 eta);
    event LimitsExecuted(uint256 maxTx, uint256 maxWallet, uint256 cooldown);

    constructor(
        address _daoWallet,
        address staking,       // kept for constructor parity / allocation mgmt
        address fairLaunch,    // optional distribution wallet
        address influencer    // optional marketing wallet
    ) ERC20("VibeToken", "VIBE") Ownable(msg.sender) {
        require(_daoWallet != address(0), "DAO wallet required");
        daoWallet = _daoWallet;

        // Mint all to deployer (owner is msg.sender)
        _mint(msg.sender, TOTAL_SUPPLY);

        // Defaults: 2%
        maxTxAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;
        maxWalletAmount = (TOTAL_SUPPLY * 200) / FEE_DENOMINATOR;

        // Exclusions
        excludedFromFees[msg.sender] = true;
        excludedFromFees[daoWallet] = true;
        excludedFromFees[address(this)] = true;
        if (staking != address(0)) excludedFromFees[staking] = true;
        if (fairLaunch != address(0)) excludedFromFees[fairLaunch] = true;
        if (influencer != address(0)) excludedFromFees[influencer] = true;

        excludedFromLimits[msg.sender] = true;
        excludedFromLimits[daoWallet] = true;
        excludedFromLimits[address(this)] = true;
        if (staking != address(0)) excludedFromLimits[staking] = true;
        if (fairLaunch != address(0)) excludedFromLimits[fairLaunch] = true;
        if (influencer != address(0)) excludedFromLimits[influencer] = true;

        // initial holder status
        _updateHolderStatus(msg.sender);
    }

    // --- Admin ---
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setFeesEnabled(bool enabled) external onlyOwner { feesEnabled = enabled; }

    function freezeFees() external onlyOwner { feesFrozen = true; }

    function scheduleFees(uint256 _burn, uint256 _dao, uint256 _reflect) external onlyOwner {
        require(!feesFrozen, "Fees frozen");
        _validateFees(_burn, _dao, _reflect);

        uint256 eta = block.timestamp + ADMIN_DELAY;
        pendingFees = PendingFees({ burn: _burn, dao: _dao, reflect: _reflect, eta: eta, queued: true });

        emit FeesScheduled(_burn, _dao, _reflect, eta);
        emit ChangeScheduled(keccak256("burnRate"), _burn, eta);
        emit ChangeScheduled(keccak256("daoRate"), _dao, eta);
        emit ChangeScheduled(keccak256("reflectRate"), _reflect, eta);
    }

    function executeFees() external onlyOwner {
        require(pendingFees.queued, "No fees queued");
        require(block.timestamp >= pendingFees.eta, "Too early");
        require(!feesFrozen, "Fees frozen");
        _validateFees(pendingFees.burn, pendingFees.dao, pendingFees.reflect);

        burnRate = pendingFees.burn;
        daoRate = pendingFees.dao;
        reflectRate = pendingFees.reflect;

        pendingFees.queued = false;
        emit FeesExecuted(burnRate, daoRate, reflectRate);
        emit ChangeExecuted(keccak256("burnRate"), burnRate);
        emit ChangeExecuted(keccak256("daoRate"), daoRate);
        emit ChangeExecuted(keccak256("reflectRate"), reflectRate);
    }

    function scheduleLimits(uint256 _maxTx, uint256 _maxWallet, uint256 _cooldown) external onlyOwner {
        require(_maxTx > 0 && _maxWallet > 0, "Bad limits");
        uint256 eta = block.timestamp + ADMIN_DELAY;
        pendingLimits = PendingLimits({ maxTx: _maxTx, maxWallet: _maxWallet, cooldown: _cooldown, eta: eta, queued: true });

        emit LimitsScheduled(_maxTx, _maxWallet, _cooldown, eta);
        emit ChangeScheduled(keccak256("maxTxAmount"), _maxTx, eta);
        emit ChangeScheduled(keccak256("maxWalletAmount"), _maxWallet, eta);
        emit ChangeScheduled(keccak256("cooldownTime"), _cooldown, eta);
    }

    function executeLimits() external onlyOwner {
        require(pendingLimits.queued, "No limits queued");
        require(block.timestamp >= pendingLimits.eta, "Too early");
        require(pendingLimits.maxTx > 0 && pendingLimits.maxWallet > 0, "Bad limits");

        maxTxAmount = pendingLimits.maxTx;
        maxWalletAmount = pendingLimits.maxWallet;
        cooldownTime = pendingLimits.cooldown;

        pendingLimits.queued = false;
        emit LimitsUpdated(maxTxAmount, maxWalletAmount, cooldownTime);
        emit LimitsExecuted(maxTxAmount, maxWalletAmount, cooldownTime);
        emit ChangeExecuted(keccak256("maxTxAmount"), maxTxAmount);
        emit ChangeExecuted(keccak256("maxWalletAmount"), maxWalletAmount);
        emit ChangeExecuted(keccak256("cooldownTime"), cooldownTime);
    }

    function relaxLimits(uint256 _maxTx, uint256 _maxWallet, uint256 _cooldown) external onlyOwner {
        require(launchTime != 0, "Not launched");
        require(_maxTx >= maxTxAmount, "maxTx only increase");
        require(_maxWallet >= maxWalletAmount, "maxWallet only increase");
        require(_cooldown <= cooldownTime, "cooldown only decrease");

        maxTxAmount = _maxTx;
        maxWalletAmount = _maxWallet;
        cooldownTime = _cooldown;

        emit LimitsUpdated(maxTxAmount, maxWalletAmount, cooldownTime);
    }

    function scheduleDAO(address _dao) external onlyOwner {
        require(_dao != address(0), "Zero");
        uint256 eta = block.timestamp + ADMIN_DELAY;
        pendingDao = PendingAddress({ value: _dao, eta: eta, queued: true });
        emit ChangeScheduledAddress(keccak256("daoWallet"), _dao, eta);
    }

    function executeDAO() external onlyOwner {
        require(pendingDao.queued, "No DAO queued");
        require(block.timestamp >= pendingDao.eta, "Too early");
        daoWallet = pendingDao.value;
        pendingDao.queued = false;
        emit ChangeExecutedAddress(keccak256("daoWallet"), daoWallet);
    }

    function setDAO(address) external pure {
        revert("Use scheduleDAO");
    }

    function setFees(uint256, uint256, uint256) external pure {
        revert("Use scheduleFees");
    }

    function setLimits(uint256, uint256, uint256) external pure {
        revert("Use scheduleLimits");
    }

    function setTradingEnabled(bool enabled) external onlyOwner {
        require(enabled, "Trading can only be enabled");
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        launchTime = block.timestamp;
        emit TradingEnabled(true);
    }

    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        launchTime = block.timestamp;
        emit TradingEnabled(true);
    }

    function setExcludedFromFees(address account, bool status) external onlyOwner {
        excludedFromFees[account] = status;
        emit ExcludedFromFees(account, status);
        _updateHolderStatus(account);
    }

    function setExcludedFromLimits(address account, bool status) external onlyOwner {
        excludedFromLimits[account] = status;
        emit ExcludedFromLimits(account, status);
    }

    function setMinTokensForDividends(uint256 amount) external onlyOwner { minTokensForDividends = amount; }

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(this), "Cannot rescue VIBE");
        IERC20(token).transfer(to, amount);
    }

    // --- Reflection accounting ---
    function dividendsOwing(address account) public view returns (uint256) {
        uint256 newDivPoints = totalDivPoints - lastDivPoints[account];
        return (balanceOf(account) * newDivPoints) / POINT_MULTIPLIER + credit[account];
    }

    function pendingRewards(address account) external view returns (uint256) {
        return dividendsOwing(account);
    }

    function claimDividends() external {
        uint256 owing = dividendsOwing(msg.sender);
        require(owing > 0, "Nothing to claim");
        lastDivPoints[msg.sender] = totalDivPoints;
        credit[msg.sender] = 0;
        unclaimedDividends -= owing;
        _transfer(address(this), msg.sender, owing);
        emit DividendsClaimed(msg.sender, owing);
        emit Claim(msg.sender, owing);
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
        emit ReflectionAccrued(reflectionAmount);
    }

    function getCirculatingSupply() public view returns (uint256) {
        return totalSupply() - balanceOf(address(0)) - balanceOf(address(0xdead)) - balanceOf(address(this));
    }

    // --- Transfer logic (OZ v5: override _update) ---
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        // Apply limits only on normal transfers (exclude mint/burn)
        if (from != address(0) && to != address(0)) {
            if (!excludedFromLimits[from] && !excludedFromLimits[to]) {
                require(tradingEnabled, "Trading off");
                require(value <= maxTxAmount, "Tx limit");
                require(balanceOf(to) + value <= maxWalletAmount, "Wallet cap");
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

        bool takeFee = feesEnabled && from != address(0) && to != address(0) && !excludedFromFees[from] && !excludedFromFees[to];

        if (takeFee) {
            uint256 totalFee = (value * (burnRate + daoRate + reflectRate)) / FEE_DENOMINATOR;
            uint256 burnAmt = (value * burnRate) / FEE_DENOMINATOR;
            uint256 daoAmt = (value * daoRate) / FEE_DENOMINATOR;
            uint256 reflectAmt = totalFee - burnAmt - daoAmt;

            if (burnAmt > 0) super._update(from, address(0xdead), burnAmt);
            if (daoAmt > 0) super._update(from, daoWallet, daoAmt);
            if (reflectAmt > 0) { super._update(from, address(this), reflectAmt); _distributeReflection(reflectAmt); }

            emit FeesDistributed(burnAmt, daoAmt, reflectAmt);
            super._update(from, to, value - totalFee);
        } else {
            super._update(from, to, value);
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

    function _validateFees(uint256 _burn, uint256 _dao, uint256 _reflect) private pure {
        require(_burn <= MAX_BURN_FEE, "Burn fee too high");
        require(_dao <= MAX_DAO_FEE, "DAO fee too high");
        require(_reflect <= MAX_REFLECTION_FEE, "Reflect fee too high");
        uint256 sum = _burn + _dao + _reflect;
        require(sum <= MAX_TOTAL_FEE, "Total fee too high");
    }

    // --- Views ---
    function getHolderCount() external view returns (uint256) { return holders.length(); }
    function getHolderAt(uint256 i) external view returns (address) { return holders.at(i); }
    function getTotalFeeRate() external view returns (uint256) { return burnRate + daoRate + reflectRate; }
}

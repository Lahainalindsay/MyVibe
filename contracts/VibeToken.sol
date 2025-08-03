// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title VibeToken
 * @dev $VIBE: burn, DAO fee, optimized reflections, vesting, anti-bot, snapshots
 */
contract VibeToken is 
    ERC20, 
    ERC20Burnable, 
    ERC20Pausable, 
    ERC20Snapshot, 
    Ownable, 
    ReentrancyGuard 
{
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant TOTAL_SUPPLY = 1111000000 * 10 ** 18;
    uint256 public constant MAX_FEE_RATE = 1000;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 private constant POINT_MULTIPLIER = 10 ** 18;

    uint256 public burnRate = 111;
    uint256 public reflectRate = 111;
    uint256 public daoRate = 111;

    uint256 public maxTxAmount = TOTAL_SUPPLY / 100;
    uint256 public maxWalletAmount = TOTAL_SUPPLY / 50;
    uint256 public cooldownTime = 60;

    address public daoWallet;
    address public stakingContract;

    uint256 public teamUnlockTime;
    uint256 public teamTokensWithdrawn;
    uint256 public immutable teamAllocation;

    mapping(address => bool) public excludedFromFees;
    mapping(address => bool) public excludedFromLimits;
    mapping(address => uint256) private _lastTxTime;
    mapping(address => uint256) public lastDivPoints;
    mapping(address => bool) public isBlacklisted;
    uint256 public totalDivPoints;
    uint256 public unclaimedDividends;
    uint256 public totalReflectionDistributed;

    EnumerableSet.AddressSet private holders;
    uint256 public minTokensForDividends = 1000 * 10 ** 18;

    bool public tradingEnabled = false;
    bool public feesEnabled = true;
    uint256 public launchTime;

    mapping(address => bool) public snapshotAuthorized;

    event DaoWalletUpdated(address indexed newDaoWallet);
    event FeesDistributed(uint256 burnAmount, uint256 daoAmount, uint256 reflectionAmount);
    event DividendClaimed(address indexed holder, uint256 amount);
    event TeamTokensWithdrawn(address indexed to, uint256 amount);
    event FeesUpdated(uint256 burnRate, uint256 reflectRate, uint256 daoRate);
    event TradingEnabled(uint256 timestamp);
    event BlacklistUpdated(address indexed account, bool isBlacklisted);
    event LimitsUpdated(uint256 maxTxAmount, uint256 maxWalletAmount);
    event SnapshotAuthorizationUpdated(address indexed account, bool authorized);
    event SnapshotTriggered(uint256 indexed id);
    event ExcludedFromFeesUpdated(address indexed account, bool isExcluded);
    event ExcludedFromLimitsUpdated(address indexed account, bool isExcluded);
    event MinTokensForDividendsUpdated(uint256 newMinTokens);
    event CooldownTimeUpdated(uint256 newCooldownTime);
    event StakingContractUpdated(address indexed newStakingContract);
    event FeesEnabledUpdated(bool enabled);

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid address");
        _;
    }

    constructor(
        address _daoWallet,
        address _stakingContract,
        address _fairLaunchAddress,
        address _influencerAddress,
        address /* _teamAddress */
    )
        ERC20("VIBE", "VIBE")
        Ownable()
    {
        daoWallet = _daoWallet;
        stakingContract = _stakingContract;

        excludedFromFees[msg.sender] = true;
        excludedFromFees[_daoWallet] = true;
        excludedFromFees[address(this)] = true;
        excludedFromFees[_stakingContract] = true;

        excludedFromLimits[msg.sender] = true;
        excludedFromLimits[_daoWallet] = true;
        excludedFromLimits[address(this)] = true;
        excludedFromLimits[_stakingContract] = true;

        uint256 fairLaunchAmount = (TOTAL_SUPPLY * 50) / 100;
        uint256 daoAmount = (TOTAL_SUPPLY * 20) / 100;
        uint256 influencerAmount = (TOTAL_SUPPLY * 10) / 100;
        uint256 teamAmount = (TOTAL_SUPPLY * 10) / 100;
        uint256 stakingAmount = (TOTAL_SUPPLY * 10) / 100;

        teamAllocation = teamAmount;

        _mint(_fairLaunchAddress, fairLaunchAmount);
        _mint(_daoWallet, daoAmount);
        _mint(_influencerAddress, influencerAmount);
        _mint(address(this), teamAmount);
        _mint(_stakingContract, stakingAmount);

        teamUnlockTime = block.timestamp + 365 days;
    }

    // === Admin Functions ===
    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        launchTime = block.timestamp;
        emit TradingEnabled(launchTime);
    }

    function enableFees(bool _enabled) external onlyOwner {
        feesEnabled = _enabled;
        emit FeesEnabledUpdated(_enabled);
    }

    function updateFees(uint256 _burnRate, uint256 _reflectRate, uint256 _daoRate) external onlyOwner {
        require(_burnRate + _reflectRate + _daoRate <= MAX_FEE_RATE, "Total fee too high");
        burnRate = _burnRate;
        reflectRate = _reflectRate;
        daoRate = _daoRate;
        emit FeesUpdated(_burnRate, _reflectRate, _daoRate);
    }

    function updateDaoWallet(address _newDaoWallet) external onlyOwner validAddress(_newDaoWallet) {
        daoWallet = _newDaoWallet;
        excludedFromFees[_newDaoWallet] = true;
        excludedFromLimits[_newDaoWallet] = true;
        emit DaoWalletUpdated(_newDaoWallet);
    }

    function updateMinTokensForDividends(uint256 _minTokens) external onlyOwner {
        minTokensForDividends = _minTokens;
        emit MinTokensForDividendsUpdated(_minTokens);
    }

    function updateCooldownTime(uint256 _cooldownTime) external onlyOwner {
        require(_cooldownTime <= 300, "Cooldown too long");
        cooldownTime = _cooldownTime;
        emit CooldownTimeUpdated(_cooldownTime);
    }

    function updateLimits(uint256 _maxTx, uint256 _maxWallet) external onlyOwner {
        maxTxAmount = _maxTx;
        maxWalletAmount = _maxWallet;
        emit LimitsUpdated(_maxTx, _maxWallet);
    }

    function updateBlacklist(address account, bool status) external onlyOwner {
        isBlacklisted[account] = status;
        emit BlacklistUpdated(account, status);
    }

    function setExcludedFromFees(address account, bool status) external onlyOwner {
        excludedFromFees[account] = status;
        emit ExcludedFromFeesUpdated(account, status);
    }

    function setExcludedFromLimits(address account, bool status) external onlyOwner {
        excludedFromLimits[account] = status;
        emit ExcludedFromLimitsUpdated(account, status);
    }

    function updateStakingContract(address _newStakingContract) external onlyOwner validAddress(_newStakingContract) {
        stakingContract = _newStakingContract;
        excludedFromFees[_newStakingContract] = true;
        excludedFromLimits[_newStakingContract] = true;
        emit StakingContractUpdated(_newStakingContract);
    }

    function withdrawTeamTokens(address to, uint256 amount) external onlyOwner {
        require(block.timestamp >= teamUnlockTime, "Locked");
        require(teamTokensWithdrawn + amount <= teamAllocation, "Exceeds allocation");
        teamTokensWithdrawn += amount;
        _transfer(address(this), to, amount);
        emit TeamTokensWithdrawn(to, amount);
    }

    function rescueStuckTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(this), "Cannot rescue VIBE");
        IERC20(token).transfer(owner(), amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // === Dividends ===
    function claimDividends() external nonReentrant {
        uint256 owed = dividendsOwing(msg.sender);
        if (owed > 0 && owed <= unclaimedDividends) {
            lastDivPoints[msg.sender] = totalDivPoints;
            unclaimedDividends -= owed;
            _transfer(address(this), msg.sender, owed);
            emit DividendClaimed(msg.sender, owed);
        } else {
            lastDivPoints[msg.sender] = totalDivPoints;
        }
    }

    function dividendsOwing(address account) public view returns (uint256) {
        if (excludedFromFees[account] || balanceOf(account) < minTokensForDividends) return 0;
        uint256 newDivPoints = totalDivPoints - lastDivPoints[account];
        return (balanceOf(account) * newDivPoints) / POINT_MULTIPLIER;
    }

    function _distributeReflection(uint256 reflectionAmount) private {
        uint256 circulatingSupply = getCirculatingSupply();
        if (circulatingSupply == 0 || reflectionAmount == 0) return;
        totalDivPoints += (reflectionAmount * POINT_MULTIPLIER) / circulatingSupply;
        unclaimedDividends += reflectionAmount;
        totalReflectionDistributed += reflectionAmount;
    }

    // === Transfer Logic ===
    function _transfer(address from, address to, uint256 amount)
        internal
        override
    {
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklisted");

        if (from != address(0) && to != address(0)) {
            if (!excludedFromLimits[from] && !excludedFromLimits[to]) {
                require(tradingEnabled, "Trading off");
                require(amount <= maxTxAmount, "Tx limit");
                require(balanceOf(to) + amount <= maxWalletAmount, "Wallet cap");
                require(_lastTxTime[from] + cooldownTime <= block.timestamp, "Cooldown");
                require(_lastTxTime[to] + cooldownTime <= block.timestamp, "Cooldown");
                _lastTxTime[from] = block.timestamp;
                _lastTxTime[to] = block.timestamp;
            }
        }

        _updateHolderStatus(from);
        _updateHolderStatus(to);

        bool takeFee = feesEnabled && !excludedFromFees[from] && !excludedFromFees[to];

        if (takeFee) {
            uint256 totalFee = (amount * (burnRate + daoRate + reflectRate)) / FEE_DENOMINATOR;
            uint256 burnAmt = (amount * burnRate) / FEE_DENOMINATOR;
            uint256 daoAmt = (amount * daoRate) / FEE_DENOMINATOR;
            uint256 reflectAmt = totalFee - burnAmt - daoAmt;

            if (burnAmt > 0) super._transfer(from, address(0xdead), burnAmt);
            if (daoAmt > 0) super._transfer(from, daoWallet, daoAmt);
            if (reflectAmt > 0) {
                super._transfer(from, address(this), reflectAmt);
                _distributeReflection(reflectAmt);
            }

            emit FeesDistributed(burnAmt, daoAmt, reflectAmt);
            super._transfer(from, to, amount - totalFee);
        } else {
            super._transfer(from, to, amount);
        }
    }

    function _updateHolderStatus(address account) private {
        if (balanceOf(account) >= minTokensForDividends && !excludedFromFees[account]) {
            holders.add(account);
        } else {
            holders.remove(account);
        }
    }

    // === Snapshots ===
    function setSnapshotAuthorization(address account, bool auth) external onlyOwner {
        snapshotAuthorized[account] = auth;
        emit SnapshotAuthorizationUpdated(account, auth);
    }

    function snapshot() external returns (uint256) {
        require(snapshotAuthorized[msg.sender], "Not authorized");
        uint256 id = _snapshot();
        emit SnapshotTriggered(id);
        return id;
    }

    // === View functions ===
    function getHolderCount() external view returns (uint256) { return holders.length(); }
    function getHolderAt(uint256 i) external view returns (address) { return holders.at(i); }
    function getTotalFeeRate() external view returns (uint256) { return burnRate + daoRate + reflectRate; }

    function getCirculatingSupply() public view returns (uint256) {
        return totalSupply() - balanceOf(address(0)) - balanceOf(address(0xdead)) - balanceOf(address(this));
    }

    function getPendingDividends(address account) external view returns (uint256) {
        return dividendsOwing(account);
    }

    function getTotalPendingDividends() external view returns (uint256) {
        return unclaimedDividends;
    }

    function isExcludedFromFees(address account) external view returns (bool) { return excludedFromFees[account]; }
    function isExcludedFromLimits(address account) external view returns (bool) { return excludedFromLimits[account]; }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Snapshot, ERC20Pausable)
    {
        super._beforeTokenTransfer(from, to, amount);
    }
}

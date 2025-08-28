// SPDX-License-Identifier: MIT
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

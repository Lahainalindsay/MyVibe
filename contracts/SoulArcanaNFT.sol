// SPDX-License-Identifier: MIT
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
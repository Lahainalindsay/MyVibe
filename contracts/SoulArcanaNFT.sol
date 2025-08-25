// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVibeToken {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IRenderer {
    function tokenURI(uint256 tokenId, uint256 arcana) external view returns (string memory);
}

contract SoulArcanaNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    IRenderer public renderer;
    IVibeToken public vibe;

    uint256 public nextTokenId;
    uint256 public mintPriceETH = 0.01 ether;
    uint256 public mintPriceVIBE = 1000 * 1e18; // 1,000 VIBE per NFT (adjust as you like)
    address public treasury; // where ETH/VIBE accumulate (this contract by default)

    mapping(uint256 => uint256) public tokenArcana;

    event Minted(address indexed minter, uint256 indexed tokenId, uint256 arcana, string currency);
    event PricesUpdated(uint256 ethPrice, uint256 vibePrice);
    event TreasuryUpdated(address indexed newTreasury);

    constructor(address _renderer, address _vibe, address _owner)
        ERC721("SoulArcanaNFT", "ARCANA")
        Ownable(_owner)
    {
        require(_renderer != address(0) && _vibe != address(0), "Bad address");
        renderer = IRenderer(_renderer);
        vibe = IVibeToken(_vibe);
        treasury = address(this);
    }

    // --- Minting ---
    function mint(uint256 quantity) external payable {
        require(quantity > 0, "Quantity > 0");
        uint256 cost = mintPriceETH * quantity;
        require(msg.value >= cost, "Insufficient ETH");
        _batchMint(msg.sender, quantity, "ETH");

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost); // refund excess
        }
    }

    function mintWithVibe(uint256 quantity) external {
        require(quantity > 0, "Quantity > 0");
        uint256 cost = mintPriceVIBE * quantity;
        bool ok = vibe.transferFrom(msg.sender, treasury, cost);
        require(ok, "VIBE transfer failed");
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
        // Mix prevrandao + timestamp + minter + tokenId
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, minter, tokenId))) % 10000;
    }

    // --- Admin ---
    function setPrices(uint256 ethPrice, uint256 vibePrice) external onlyOwner {
        mintPriceETH = ethPrice;
        mintPriceVIBE = vibePrice;
        emit PricesUpdated(ethPrice, vibePrice);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // --- Withdrawals ---
    function withdrawETH(address payable to) external onlyOwner {
        if (to == payable(address(0))) to = payable(owner());
        to.transfer(address(this).balance);
    }

    // Note: VIBE tokens accumulate in treasury via transferFrom in mintWithVibe
    // If treasury==this contract, you may add a sweep function for arbitrary ERC20 if needed.

    // --- Metadata ---
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Nonexistent token");
        return renderer.tokenURI(tokenId, tokenArcana[tokenId]);
    }
}

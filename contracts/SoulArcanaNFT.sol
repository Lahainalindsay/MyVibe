// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
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

    address public treasury; // default: this contract

    mapping(uint256 => uint256) public tokenArcana;

    event Minted(address indexed minter, uint256 indexed tokenId, uint256 arcana, string currency);
    event PricesUpdated(uint256 ethPrice, uint256 vibePrice);
    event TreasuryUpdated(address indexed newTreasury);
    event MaxMintUpdated(uint256 maxMintPerTx);

    constructor(address _renderer, address _vibe, address _owner)
        ERC721("SoulArcanaNFT", "ARCANA")
    {
        require(_renderer != address(0) && _vibe != address(0), "Bad address");
        renderer = IRenderer(_renderer);
        vibe = IERC20(_vibe);
        treasury = address(this);
        require(_owner != address(0), "Owner required");
        _transferOwnership(_owner);
    }

    // --- Minting ---
    function mint(uint256 quantity) external payable {
        require(quantity > 0, "Quantity > 0");
        require(quantity <= maxMintPerTx, "Too many");

        uint256 cost = mintPriceETH * quantity;
        require(msg.value >= cost, "Insufficient ETH");

        _batchMint(msg.sender, quantity, "ETH");

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost); // refund excess
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
        return uint256(keccak256(abi.encodePacked(block.timestamp, minter, tokenId))) % 10000;
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

    function setMaxMintPerTx(uint256 _max) external onlyOwner {
        require(_max > 0, "Zero");
        maxMintPerTx = _max;
        emit MaxMintUpdated(_max);
    }

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
        require(_ownerOf(tokenId) != address(0), "Nonexistent token");
        return renderer.tokenURI(tokenId, tokenArcana[tokenId]);
    }
}

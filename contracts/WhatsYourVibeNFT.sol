// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface IRenderer {
    function tokenURI(uint256 tokenId, uint256 arcana) external view returns (string memory);
}

contract WhatsYourVibeNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    IRenderer public renderer;
    IERC20 public vibe;

    uint256 public nextTokenId;
    uint256 public mintPriceETH = 0.01 ether;
    uint256 public mintPriceVIBE = 1000 * 1e18; // per NFT
    uint256 public maxMintPerTx = 20;

    address public treasury; // default: this contract

    // Reveal / pre‑reveal
    bool public revealed = false;
    string public preRevealName = "Vibe Gift Box";
    string public preRevealDescription = "A sleek gift box with a golden bow. Contents reveal on launch.";

    mapping(uint256 => uint256) public tokenArcana;

    event Minted(address indexed minter, uint256 indexed tokenId, uint256 arcana, string currency);
    event PricesUpdated(uint256 ethPrice, uint256 vibePrice);
    event TreasuryUpdated(address indexed newTreasury);
    event MaxMintUpdated(uint256 maxMintPerTx);
    event Revealed(bool revealed);

    constructor(address _renderer, address _vibe, address _owner)
        ERC721("WhatsYourVibe", "WYV")
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

    function airdrop(address to, uint256 quantity) external onlyOwner {
        require(to != address(0) && quantity > 0, "Bad airdrop");
        _batchMint(to, quantity, "AIRDROP");
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

    function setPreRevealCopy(string calldata name_, string calldata description_) external onlyOwner {
        preRevealName = name_;
        preRevealDescription = description_;
    }

    function setRevealed(bool status) external onlyOwner {
        revealed = status;
        emit Revealed(status);
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
        if (!revealed) {
            return _preRevealTokenURI(tokenId);
        }
        return renderer.tokenURI(tokenId, tokenArcana[tokenId]);
    }

    function _preRevealTokenURI(uint256 tokenId) internal view returns (string memory) {
        string memory name_ = string.concat(preRevealName, " #", tokenId.toString());
        string memory image = _giftBoxImage();
        bytes memory json = abi.encodePacked(
            '{"name":"', name_,
            '","description":"', preRevealDescription,
            '","attributes":[{"trait_type":"State","value":"Sealed"}],',
            '"image":"', image, '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _giftBoxImage() internal pure returns (string memory) {
        // Minimal high‑end gift box SVG with a golden bow
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">',
            '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">',
            '<stop offset="0%" stop-color="#0f0f13"/><stop offset="100%" stop-color="#23232b"/></linearGradient>',
            '<linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">',
            '<stop offset="0%" stop-color="#f4e7b9"/><stop offset="100%" stop-color="#d4af37"/></linearGradient></defs>',
            '<rect width="512" height="512" fill="url(#g)"/>',
            '<rect x="96" y="120" width="320" height="272" rx="24" fill="#14141a" stroke="#2a2a34" stroke-width="4"/>',
            '<rect x="96" y="120" width="320" height="42" fill="url(#gold)"/>',
            '<rect x="240" y="120" width="32" height="272" fill="url(#gold)"/>',
            '<circle cx="256" cy="140" r="32" fill="url(#gold)"/>',
            '<path d="M256 140 c -26 -18 -54 -22 -75 0 c 21 12 33 26 38 44 c 7 -18 20 -32 37 -44 z" fill="#f6e8c3" opacity="0.5"/>',
            '<path d="M256 140 c 26 -18 54 -22 75 0 c -21 12 -33 26 -38 44 c -7 -18 -20 -32 -37 -44 z" fill="#f6e8c3" opacity="0.5"/>',
            '</svg>'
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }
}


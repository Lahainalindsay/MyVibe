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
        ERC721("WhatsYourVibe", "VYX")
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
        // High‑end gift box with depth, shadow, and a name tag: "what's your vibe?"
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
            '<defs>\n',
            // Background radial gradient
            '<radialGradient id="bg" cx="50%" cy="35%" r="70%">',
            '<stop offset="0%" stop-color="#1a1a23"/><stop offset="100%" stop-color="#0a0a0f"/></radialGradient>',
            // Gold gradient
            '<linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">',
            '<stop offset="0%" stop-color="#f7e7b9"/><stop offset="50%" stop-color="#e7c15a"/><stop offset="100%" stop-color="#b8890b"/></linearGradient>',
            // Satin gradient for box
            '<linearGradient id="satin" x1="0" x2="1" y1="0" y2="1">',
            '<stop offset="0%" stop-color="#0f1118"/><stop offset="50%" stop-color="#171a24"/><stop offset="100%" stop-color="#0d0f15"/></linearGradient>',
            // Soft inner highlight
            '<radialGradient id="glow" cx="50%" cy="40%" r="60%">',
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.08"/>',
            '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>',
            // Drop shadow filter
            '<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">',
            '<feOffset dy="10" in="SourceAlpha" result="off"/>',
            '<feGaussianBlur in="off" stdDeviation="12" result="blur"/>',
            '<feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0"/>',
            '</filter>',
            // Label styling
            '<linearGradient id="label" x1="0" y1="0" x2="1" y2="0">',
            '<stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#f7f7f7"/></linearGradient>',
            '</defs>\n',
            // Background
            '<rect width="512" height="512" fill="url(#bg)"/>',
            '<rect width="512" height="512" fill="url(#glow)"/>',
            // Shadow under box
            '<ellipse cx="256" cy="370" rx="140" ry="28" fill="#000" opacity="0.35" filter="url(#shadow)"/>',
            // Box base (front face)
            '<g filter="url(#shadow)">',
            '<rect x="116" y="170" width="280" height="210" rx="18" fill="url(#satin)" stroke="#242838" stroke-width="3"/>',
            // Subtle front face sheen
            '<rect x="116" y="170" width="280" height="210" rx="18" fill="url(#glow)"/>',
            '</g>',
            // Box lid (slightly forward with perspective using a top polygon)
            '<g>',
            '<polygon points="116,170 396,170 380,142 132,142" fill="#151826" stroke="#242838" stroke-width="3"/>',
            '<polygon points="116,170 396,170 380,142 132,142" fill="url(#glow)" opacity="0.25"/>',
            '</g>',
            // Vertical and horizontal golden ribbons
            '<rect x="246" y="142" width="20" height="238" fill="url(#gold)"/>',
            '<rect x="116" y="170" width="280" height="26" fill="url(#gold)"/>',
            // Bow (stylized) at top center
            '<g transform="translate(256,155)">',
            '<circle cx="0" cy="0" r="16" fill="url(#gold)"/>',
            '<path d="M0 0 C -40 -24 -78 -22 -96 6 C -62 10 -40 24 -28 44 C -18 20 -8 8 0 0 Z" fill="#f1d98a" opacity="0.8"/>',
            '<path d="M0 0 C 40 -24 78 -22 96 6 C 62 10 40 24 28 44 C 18 20 8 8 0 0 Z" fill="#f1d98a" opacity="0.8"/>',
            '</g>',
            // Name tag "what\'s your vibe?" affixed on the box front
            '<g transform="translate(180,230) rotate(-4)">',
            '<rect x="0" y="0" width="152" height="58" rx="10" fill="url(#label)" stroke="#ff4da6" stroke-width="3"/>',
            '<rect x="0" y="0" width="152" height="58" rx="10" fill="#ffffff" opacity="0.85"/>',
            '<text x="12" y="36" font-family="\'Helvetica Neue\', Arial, sans-serif" font-size="18" font-weight="600" fill="#20222b">what\'s your vibe?</text>',
            '</g>',
            // Subtle sparkles
            '<g fill="#ffd86b" opacity="0.85">',
            '<circle cx="96" cy="96" r="2"/><circle cx="420" cy="120" r="1.6"/><circle cx="420" cy="420" r="1.2"/><circle cx="86" cy="406" r="1.4"/>',
            '</g>',
            '</svg>'
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }
}

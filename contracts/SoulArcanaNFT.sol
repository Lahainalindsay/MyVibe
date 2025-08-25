// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SigilArcanaOnChainRenderer.sol";
import "./VibeToken.sol";

contract SoulArcanaNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;

    // External contracts
    SigilArcanaOnChainRenderer public renderer;
    VibeToken public vibe;

    // Base settings
    uint256 public nextTokenId;
    uint256 public mintPrice = 0.01 ether;

    // Storage for arcana
    mapping(uint256 => uint256) public tokenArcana;

    event MintedWithVibe(address indexed minter, uint256 indexed tokenId, uint256 arcana);

    constructor(address _renderer, address _vibe) 
        ERC721("SoulArcanaNFT", "ARCANA") 
        Ownable(msg.sender) 
    {
        renderer = SigilArcanaOnChainRenderer(_renderer);
        vibe = VibeToken(_vibe);
    }

    /// @notice Mint with ETH payment
    function mint() external payable {
        require(msg.value >= mintPrice, "Not enough ETH");
        _mintSoul(msg.sender);
    }

    /// @notice Mint with VIBE token payment
    function mintWithVibe(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        require(vibe.transferFrom(msg.sender, address(this), amount), "Vibe transfer failed");
        _mintSoul(msg.sender);
    }

    function _mintSoul(address to) internal {
        uint256 tokenId = nextTokenId++;
        uint256 arcana = _generateArcana(tokenId, to);

        tokenArcana[tokenId] = arcana;
        _safeMint(to, tokenId);

        emit MintedWithVibe(to, tokenId, arcana);
    }

    function _generateArcana(uint256 tokenId, address minter) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, tokenId, minter))) % 10000;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Nonexistent token");
        return renderer.tokenURI(tokenId, tokenArcana[tokenId]);
    }

    /// @notice Withdraw ETH from sales
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /// @notice Withdraw stuck VIBE tokens
    function withdrawVibe(uint256 amount) external onlyOwner {
        require(vibe.transfer(owner(), amount), "Transfer failed");
    }
}

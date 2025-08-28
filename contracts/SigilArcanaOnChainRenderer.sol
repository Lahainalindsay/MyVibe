// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  Sigils of the Soul — ARCANA NFT + On-Chain Renderer
  - ERC721A NFT contract (ARCANA generation, mint phases, VIBE discount, VIP pool, awakening)
  - ERC2981 royalties
  - Signature-gated mint + open mint + VIP mint
  - Arcana stored per-token as uint256
  - Separate on-chain renderer contract included below that returns tokenURI JSON with:
      - data:image/svg+xml;base64(...) image
      - attributes[] decoded from ARCANA
  - Use: deploy NFT, deploy renderer, call nft.setRenderer(rendererAddr)
*/

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/// ========= Interface for renderer to call back into NFT ==============
interface ISigilsArcana {
    function arcanaOf(uint256 tokenId) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// ========= Arcana NFT Contract =======================================
contract SigilsOfTheSoul is ERC721A, ERC2981, Ownable, AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using Strings for uint256;

    // Roles
    bytes32 public constant EXPULSION_ROLE = keccak256("EXPULSION_ROLE");
    bytes32 public constant URI_MANAGER_ROLE = keccak256("URI_MANAGER_ROLE");
    bytes32 public constant MINT_MANAGER_ROLE = keccak256("MINT_MANAGER_ROLE");

    // Supply / price / limits
    uint256 public maxSupply = 1111;
    uint256 public mintPrice = 0.0111 ether;
    uint256 public maxPerTx = 10;
    uint256 public maxPerWallet = 0;

    // Phases
    bool public publicMintOpen = false;
    bool public sigMintOpen = true;
    bool public vipMintOpen = false;
    bool public awakeningOpen = false;

    // VIBE discount
    IERC20 public vibeToken;
    uint256 public vibeDiscountPercentage = 20;

    // Signature gating
    address public signer;
    mapping(bytes32 => bool) public usedNonces;

    // VIP pool
    IERC721 public vipCollection;
    uint256 public vipPoolRemaining;
    uint256 public vipClaimsPerToken = 2;
    mapping(uint256 => uint256) public vipClaimsUsed;

    // Awakening
    mapping(uint256 => uint256) private awakeningStart;
    mapping(uint256 => uint256) private awakeningTotal;
    uint256 private awakeningTransfer = 1;

    // Metadata / renderer
    string private _baseTokenURI;
    string public unrevealedURI;
    address public renderer; // address of SigilOnChainRenderer-compatible contract

    // ARCANA
    mapping(uint256 => uint256) private _arcana;
    bytes32 public entropySalt;

    // Events
    event Minted(address indexed to, uint256 indexed tokenId, uint256 arcana);
    event RendererUpdated(address indexed renderer);
    event BaseURIUpdated(string newURI);
    event UnrevealedURIUpdated(string newURI);

    // Constructor
    constructor(
        string memory baseURI_,
        string memory unrevealedURI_,
        address royaltyReceiver,
        uint96 royaltyBps
    ) ERC721A("Sigils of the Soul", "SIGIL") Ownable() {
        _baseTokenURI = baseURI_;
        unrevealedURI = unrevealedURI_;
        _setDefaultRoyalty(
            royaltyReceiver == address(0) ? msg.sender : royaltyReceiver,
            royaltyBps
        );
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXPULSION_ROLE, msg.sender);
        _grantRole(URI_MANAGER_ROLE, msg.sender);
        _grantRole(MINT_MANAGER_ROLE, msg.sender);
    }

    // ---------------- Admin setters ----------------
    function setRenderer(address r) external onlyRole(URI_MANAGER_ROLE) {
        renderer = r;
        emit RendererUpdated(r);
    }

    function setBaseURI(string memory newURI) external onlyRole(URI_MANAGER_ROLE) {
        _baseTokenURI = newURI;
        emit BaseURIUpdated(newURI);
    }

    function setUnrevealedURI(string memory newURI) external onlyRole(URI_MANAGER_ROLE) {
        unrevealedURI = newURI;
        emit UnrevealedURIUpdated(newURI);
    }

    function setMintPrice(uint256 priceWei) external onlyRole(MINT_MANAGER_ROLE) {
        require(priceWei > 0, "Zero price");
        mintPrice = priceWei;
    }

    function setMintStatuses(bool publicOpen, bool sigOpen, bool vipOpen) external onlyRole(MINT_MANAGER_ROLE) {
        publicMintOpen = publicOpen;
        sigMintOpen = sigOpen;
        vipMintOpen = vipOpen;
    }

    function setVibeToken(address token) external onlyOwner {
        vibeToken = IERC20(token);
    }

    function setVibeDiscountPercentage(uint256 pct) external onlyOwner {
        require(pct <= 100, ">100");
        vibeDiscountPercentage = pct;
    }

    function setLimits(uint256 _maxPerTx, uint256 _maxPerWallet) external onlyOwner {
        maxPerTx = _maxPerTx;
        maxPerWallet = _maxPerWallet;
    }

    function setMaxSupply(uint256 newMax) external onlyOwner {
        require(newMax >= totalSupply(), "Below current");
        maxSupply = newMax;
    }

    function setRoyaltyInfo(address receiver, uint96 feeBps) external onlyOwner {
        _setDefaultRoyalty(receiver, feeBps);
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
    }

    function setVipConfig(address collection, uint256 poolRemaining, uint256 claimsPerToken_) external onlyOwner {
        vipCollection = IERC721(collection);
        vipPoolRemaining = poolRemaining;
        vipClaimsPerToken = claimsPerToken_;
    }

    function setEntropySalt(bytes32 salt) external onlyOwner {
        entropySalt = salt;
    }

    // ---------------- Internal utils ----------------
    function _effectivePrice(address buyer) internal view returns (uint256) {
        uint256 price = mintPrice;
        if (address(vibeToken) != address(0) && vibeToken.balanceOf(buyer) > 0) {
            price = (price * (100 - vibeDiscountPercentage)) / 100;
        }
        return price;
    }

    function _checkWalletLimit(address to, uint256 quantity) internal view {
        if (maxPerWallet > 0) {
            require(_numberMinted(to) + quantity <= maxPerWallet, "Wallet limit");
        }
    }

    function _preMintChecks(address to, uint256 quantity) internal view {
        require(quantity > 0, "Qty=0");
        if (maxPerTx > 0) require(quantity <= maxPerTx, "Max per tx");
        _checkWalletLimit(to, quantity);
        require(totalSupply() + quantity <= maxSupply, "Max supply");
    }

    // ---------------- Mint functions ----------------
    function mintOpen(uint256 quantity) external payable nonReentrant {
        require(publicMintOpen, "Public mint closed");
        _preMintChecks(msg.sender, quantity);
        uint256 cost = _effectivePrice(msg.sender) * quantity;
        require(msg.value >= cost, "Insufficient ETH");
        uint256 startId = _nextTokenId();
        _safeMint(msg.sender, quantity);
        _assignArcanaBatch(msg.sender, startId, quantity);
        _refundExcess(cost);
    }

    function mintWithSig(uint256 quantity, bytes32 nonce, bytes calldata signature) external payable nonReentrant {
        require(sigMintOpen, "Sig mint closed");
        require(signer != address(0), "Signer unset");
        require(!usedNonces[nonce], "Nonce used");
        usedNonces[nonce] = true;

        _preMintChecks(msg.sender, quantity);
        bytes32 digest = keccak256(abi.encodePacked(msg.sender, quantity, nonce)).toEthSignedMessageHash();
        require(digest.recover(signature) == signer, "Invalid sig");

        uint256 cost = _effectivePrice(msg.sender) * quantity;
        require(msg.value >= cost, "Insufficient ETH");
        uint256 startId = _nextTokenId();
        _safeMint(msg.sender, quantity);
        _assignArcanaBatch(msg.sender, startId, quantity);
        _refundExcess(cost);
    }

    function mintVIP(uint256[] calldata vipTokenIds, uint256 quantity) external payable nonReentrant {
        require(vipMintOpen, "VIP closed");
        require(address(vipCollection) != address(0), "VIP unset");
        _preMintChecks(msg.sender, quantity);

        uint256 canClaim;
        for (uint256 i = 0; i < vipTokenIds.length; ++i) {
            uint256 tid = vipTokenIds[i];
            require(vipCollection.ownerOf(tid) == msg.sender, "Not VIP owner");
            uint256 remaining = vipClaimsPerToken > vipClaimsUsed[tid] ? (vipClaimsPerToken - vipClaimsUsed[tid]) : 0;
            canClaim += remaining;
        }
        require(canClaim >= quantity, "Insufficient VIP claims");
        require(quantity <= vipPoolRemaining, "VIP pool exhausted");
        vipPoolRemaining -= quantity;

        uint256 q = quantity;
        for (uint256 i = 0; i < vipTokenIds.length && q > 0; ++i) {
            uint256 tid = vipTokenIds[i];
            uint256 remaining = vipClaimsPerToken > vipClaimsUsed[tid] ? (vipClaimsPerToken - vipClaimsUsed[tid]) : 0;
            if (remaining == 0) continue;
            uint256 useNow = remaining > q ? q : remaining;
            vipClaimsUsed[tid] += useNow;
            q -= useNow;
        }

        uint256 cost = _effectivePrice(msg.sender) * quantity;
        require(msg.value >= cost, "Insufficient ETH");
        uint256 startId = _nextTokenId();
        _safeMint(msg.sender, quantity);
        _assignArcanaBatch(msg.sender, startId, quantity);
        _refundExcess(cost);
    }

    function _refundExcess(uint256 due) internal {
        if (msg.value > due) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - due}("");
            require(ok, "Refund failed");
        }
    }

    // ---------------- ARCANA generation ----------------
    function arcanaOf(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "No token");
        return _arcana[tokenId];
    }

    function _assignArcanaBatch(address to, uint256 startId, uint256 quantity) internal {
        unchecked {
            for (uint256 i = 0; i < quantity; ++i) {
                uint256 tokenId = startId + i;
                uint256 a = _deriveArcana(to, tokenId);
                _arcana[tokenId] = a;
                emit Minted(to, tokenId, a);
            }
        }
    }

    function _deriveArcana(address minter, uint256 tokenId) internal view returns (uint256) {
        bytes32 h = keccak256(abi.encodePacked(block.prevrandao, block.timestamp, minter, tokenId, entropySalt));
        return uint256(h);
    }

    // ---------------- Decoders convenience (examples) ----------------
    // The renderer may use these, or decode directly on its own.
    function decodeElement(uint256 tokenId, uint256 options) external view returns (uint256) {
        require(_exists(tokenId), "No token");
        return (_arcana[tokenId] / 10**6) % options;
    }

    function decodeHeadShape(uint256 tokenId, uint256 options) external view returns (uint256) {
        require(_exists(tokenId), "No token");
        return (_arcana[tokenId] / 10**0) % options;
    }

    // ---------------- Awakening (nesting) ----------------
    function toggleAwakening(uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; ++i) {
            _toggleAwakening(tokenIds[i]);
        }
    }

    function _toggleAwakening(uint256 tokenId) internal {
        require(_exists(tokenId), "No token");
        require(_isApprovedOrOwner(_msgSender(), tokenId), "Not approved/owner");
        uint256 start = awakeningStart[tokenId];
        if (start == 0) {
            require(awakeningOpen, "Awakening closed");
            awakeningStart[tokenId] = block.timestamp;
            emit Awakened(tokenId);
        } else {
            awakeningTotal[tokenId] += block.timestamp - start;
            awakeningStart[tokenId] = 0;
            emit Slumbered(tokenId);
        }
    }

    event Awakened(uint256 indexed tokenId);
    event Slumbered(uint256 indexed tokenId);
    event Expelled(uint256 indexed tokenId);

    function expelFromAwakening(uint256 tokenId) external onlyRole(EXPULSION_ROLE) {
        require(awakeningStart[tokenId] != 0, "Not awakened");
        awakeningTotal[tokenId] += block.timestamp - awakeningStart[tokenId];
        awakeningStart[tokenId] = 0;
        emit Slumbered(tokenId);
        emit Expelled(tokenId);
    }

    function awakeningPeriod(uint256 tokenId) external view returns (bool awakened, uint256 current, uint256 total) {
        uint256 start = awakeningStart[tokenId];
        if (start != 0) {
            awakened = true;
            current = block.timestamp - start;
        }
        total = current + awakeningTotal[tokenId];
    }

    function safeTransferWhileAwakened(address from, address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == _msgSender(), "Only owner");
        awakeningTransfer = 2;
        safeTransferFrom(from, to, tokenId);
        awakeningTransfer = 1;
    }

    function _beforeTokenTransfers(address from, address to, uint256 startTokenId, uint256 quantity) internal override {
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
        if (from != address(0) && to != address(0)) {
            for (uint256 id = startTokenId; id < startTokenId + quantity; ++id) {
                require(awakeningStart[id] == 0 || awakeningTransfer == 2, "Awakening: transfer blocked");
            }
        }
    }

    // ---------------- Token URI ----------------
    // If renderer set, call it; else fallback to unrevealedURI or baseURI+id
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "No token");
        if (renderer != address(0)) {
            // safe low-level call to renderer.tokenURI(tokenId)
            (bool ok, bytes memory ret) = renderer.staticcall(abi.encodeWithSignature("tokenURI(uint256)", tokenId));
            require(ok && ret.length > 0, "Renderer call failed");
            return abi.decode(ret, (string));
        }
        if (bytes(unrevealedURI).length != 0) {
            return unrevealedURI;
        }
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
    }

    // ---------------- Withdraw ----------------
    function withdraw() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "No funds");
        (bool ok, ) = payable(owner()).call{value: bal}("");
        require(ok, "Withdraw failed");
    }

    // ---------------- Interfaces ----------------
    function supportsInterface(bytes4 interfaceId) public view override(ERC721A, ERC2981, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

/// ========= On-Chain Renderer Contract =================================
contract SigilOnChainRenderer is Ownable {
    using Strings for uint256;

    ISigilsArcana public sigilsContract;

    // palettes / names
    string[] public bgColors = ["#071019", "#0B1F2A", "#08130D", "#140a1f", "#02121a", "#0a0714"];
    string[] public coreColors = ["#7CFC00", "#00E5FF", "#FF6A00", "#FFD700", "#9B59B6", "#FF4D6D"];
    string[] public auraColors = ["#26A65B", "#2ECCFA", "#FF9F1C", "#F7DC6F", "#6AB04C", "#E74C3C"];
    string[] public shapeNames = ["Circle","Hex","Triangle","Square","Star","Eye"];
    string[] public elementNames = ["Earth","Air","Fire","Water","Wood","Ether"];
    string[] public rarityNames = ["Common","Uncommon","Rare","Epic","Legendary","Mythic"];

    event SigilsContractUpdated(address indexed previous, address indexed current);

    constructor(address _sigils) {
        if (_sigils != address(0)) {
            sigilsContract = ISigilsArcana(_sigils);
            emit SigilsContractUpdated(address(0), _sigils);
        }
    }

    function setSigilsContract(address _sigils) external onlyOwner {
        require(_sigils != address(0), "Zero address");
        emit SigilsContractUpdated(address(sigilsContract), _sigils);
        sigilsContract = ISigilsArcana(_sigils);
    }

    // Helpers for owner to update palettes (optional)
    function setBgColor(uint256 idx, string calldata color) external onlyOwner { require(idx < bgColors.length); bgColors[idx] = color; }
    function setCoreColor(uint256 idx, string calldata color) external onlyOwner { require(idx < coreColors.length); coreColors[idx] = color; }
    function setAuraColor(uint256 idx, string calldata color) external onlyOwner { require(idx < auraColors.length); auraColors[idx] = color; }

    // Main tokenURI: returns full JSON with image + attributes
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(address(sigilsContract) != address(0), "Renderer: sigils unset");
        uint256 arcana = sigilsContract.arcanaOf(tokenId);

        // decode some features with modulo slices
        uint256 headIdx = (arcana / (10**0)) % shapeNames.length;       // 0..5
        uint256 coreIdx = (arcana / (10**2)) % coreColors.length;       // 0..5
        uint256 auraIdx = (arcana / (10**4)) % auraColors.length;       // 0..5
        uint256 bgIdx   = (arcana / (10**6)) % bgColors.length;         // 0..5
        uint256 elementIdx = (arcana / (10**8)) % elementNames.length;  // 0..5
        uint256 rarityIdx = (arcana / (10**10)) % rarityNames.length;   // 0..5

        string memory name = string(abi.encodePacked("Sigil of the Soul #", tokenId.toString()));
        string memory description = "Sigil of the Soul — on-chain ARCANA-driven sigil with attributes.";

        string memory svg = _generateSVG(tokenId, headIdx, coreIdx, auraIdx, bgIdx);
        string memory image = string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));

        // attributes JSON array
        string memory attributes = string(
            abi.encodePacked(
                '[',
                    '{\"trait_type\":\"Shape\",\"value\":\"', shapeNames[headIdx], '\"},',
                    '{\"trait_type\":\"CoreColor\",\"value\":\"', coreColors[coreIdx], '\"},',
                    '{\"trait_type\":\"AuraColor\",\"value\":\"', auraColors[auraIdx], '\"},',
                    '{\"trait_type\":\"Background\",\"value\":\"', bgColors[bgIdx], '\"},',
                    '{\"trait_type\":\"Element\",\"value\":\"', elementNames[elementIdx], '\"},',
                    '{\"trait_type\":\"Rarity\",\"value\":\"', rarityNames[rarityIdx], '\"}',
                ']'
            )
        );

        string memory json = string(
            abi.encodePacked(
                '{"name":"', name,
                '","description":"', description,
                '","image":"', image,
                '","attributes":', attributes,
                '}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    // SVG builder (compact & animated)
    function _generateSVG(uint256 tokenId, uint256 headIdx, uint256 coreIdx, uint256 auraIdx, uint256 bgIdx) internal view returns (string memory) {
        string memory bg = bgColors[bgIdx];
        string memory core = coreColors[coreIdx];
        string memory aura = auraColors[auraIdx];

        string memory shapeSVG = _shapeByIndex(headIdx);

        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">',
                    '<rect width="100%" height="100%" fill="', bg, '"/>',
                    '<g transform="translate(400,400)">',
                        '<g style="mix-blend-mode:screen">',
                            '<circle r="220" fill="none" stroke="', aura, '" stroke-width="12" opacity="0.16">',
                                '<animate attributeName="r" values="200;240;200" dur="6s" repeatCount="indefinite"/>',
                                '<animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/>',
                            '</circle>',
                        '</g>',
                        '<g transform="rotate(0)"><circle r="150" fill="none" stroke="', aura, '" stroke-width="4" opacity="0.08"/></g>',
                        '<g transform="rotate(45)"><circle r="180" fill="none" stroke="', aura, '" stroke-width="3" opacity="0.05"/></g>',
                        '<g>',
                            '<circle r="86" fill="', core, '" opacity="0.12"><animate attributeName="opacity" values="0.08;0.18;0.08" dur="3s" repeatCount="indefinite"/></circle>',
                            '<circle r="60" fill="', core, '"><animate attributeName="r" values="56;64;56" dur="2.4s" repeatCount="indefinite"/></circle>',
                        '</g>',
                        shapeSVG,
                    '</g>',
                    '<text x="50%" y="760" font-family="Verdana, sans-serif" font-size="18" fill="#AAAAAA" text-anchor="middle">Sigil #', tokenId.toString(), '</text>',
                '</svg>'
            )
        );

        return svg;
    }

    function _shapeByIndex(uint256 idx) internal view returns (string memory) {
        if (idx == 0) {
            return string(abi.encodePacked(
                '<g><circle r="120" fill="none" stroke-opacity="0.08" stroke="#FFFFFF" stroke-width="2"/></g>'
            ));
        } else if (idx == 1) {
            return string(abi.encodePacked(
                '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"><polygon points="-0,-220 190,-110 190,110 0,220 -190,110 -190,-110" transform="scale(0.37)"/></g>'
            ));
        } else if (idx == 2) {
            return string(abi.encodePacked(
                '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"><polygon points="0,-220 190,160 -190,160" transform="scale(0.37)"/></g>'
            ));
        } else if (idx == 3) {
            return string(abi.encodePacked(
                '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"><rect x="-150" y="-150" width="300" height="300" rx="18" transform="scale(0.6)"/></g>'
            ));
        } else if (idx == 4) {
            return string(abi.encodePacked(
                '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"><path d="M0 -220 L43 -68 L195 -68 L72 28 L118 180 L0 86 L-118 180 L-72 28 L-195 -68 L-43 -68 Z" transform="scale(0.37)"/></g>'
            ));
        } else {
            return string(abi.encodePacked(
                '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="3"><path d="M-200 0 Q -120 -120 0 -120 Q 120 -120 200 0 Q 120 120 0 120 Q -120 120 -200 0 Z" transform="scale(0.35)"/><circle r="28" fill="#FFFFFF" fill-opacity="0.08"/></g>'
            ));
        }
    }
}

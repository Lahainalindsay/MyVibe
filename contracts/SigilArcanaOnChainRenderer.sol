// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract SigilArcanaOnChainRenderer {
    using Strings for uint256;

    function tokenURI(uint256 tokenId, uint256 arcana) external pure returns (string memory) {
        string memory name = string.concat("SoulArcana #", tokenId.toString());
        string memory description = "On-chain arcana soul — procedurally generated.";
        string memory image = _buildSVG(arcana, tokenId);

        bytes memory json = abi.encodePacked(
            '{"name":"', name,
            '","description":"', description,
            '","attributes":[{"trait_type":"Arcana","value":"', arcana.toString(),
            '"}],"image":"', image, '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _buildSVG(uint256 arcana, uint256 tokenId) private pure returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(arcana, tokenId));
        uint8 r = uint8(h[0]); uint8 g = uint8(h[1]); uint8 b = uint8(h[2]);

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">',
            '<rect width="512" height="512" fill="rgb(', _u(r), ',', _u(g), ',', _u(b), ')"/>',
            '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#fff">',
            'ARCANA: ', _u(uint8(arcana % 251)), '</text>',
            '</svg>'
        );

        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }

    function _u(uint8 v) private pure returns (string memory) { return Strings.toString(uint256(v)); }
}
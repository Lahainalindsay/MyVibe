// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockV2Factory} from "./MockV2Factory.sol";
import {MockV2Pair} from "./MockV2Pair.sol";

contract MockV2Router {
    MockV2Factory public immutable factory;

    constructor(address factory_) {
        factory = MockV2Factory(factory_);
    }

    function getPair(address tokenA, address tokenB) public view returns (address) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return factory.getPair(token0, token1);
    }

    function ensurePair(address tokenA, address tokenB) public returns (address pair) {
        pair = getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }
    }

    // Minimal addLiquidity: user must approve this router for both tokens
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) external returns (address pair) {
        pair = ensurePair(tokenA, tokenB);
        // Pull tokens into router, approve pair, then pair pulls from router.
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired), "pull A");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired), "pull B");

        // Sort amounts to match pair's token0/token1 ordering
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (uint256 amount0, uint256 amount1) = tokenA == token0
            ? (amountADesired, amountBDesired)
            : (amountBDesired, amountADesired);

        IERC20(token0).approve(pair, amount0);
        IERC20(token1).approve(pair, amount1);
        MockV2Pair(pair).addLiquidity(amount0, amount1);
    }

    // Path length must be 2; supports fee-on-transfer tokens.
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 /*amountOutMin*/,
        address[] calldata path,
        address to
    ) external {
        require(path.length == 2, "path2");
        address tokenIn = path[0];
        address tokenOut = path[1];
        address pair = ensurePair(tokenIn, tokenOut);

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "pull in");
        IERC20(tokenIn).approve(pair, amountIn);
        MockV2Pair(pair).swap(tokenIn, amountIn, to);
    }
}

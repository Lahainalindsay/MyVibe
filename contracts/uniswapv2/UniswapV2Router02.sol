// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UniswapV2Factory} from "./UniswapV2Factory.sol";
import {UniswapV2Pair} from "./UniswapV2Pair.sol";
import {WETH9} from "./WETH9.sol";

contract UniswapV2Router02 {
    UniswapV2Factory public immutable factory;
    address public immutable WETH;

    constructor(address factory_, address weth_) {
        require(factory_ != address(0) && weth_ != address(0), "bad args");
        factory = UniswapV2Factory(factory_);
        WETH = weth_;
    }

    receive() external payable {}

    function _ensurePair(address tokenA, address tokenB) internal returns (address pair) {
        pair = factory.getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 /*amountAMin*/,
        uint256 /*amountBMin*/,
        address /*to*/,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, "EXPIRED");

        amountA = amountADesired;
        amountB = amountBDesired;

        address pair = _ensurePair(tokenA, tokenB);

        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "pull A");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "pull B");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (uint256 amount0, uint256 amount1) = tokenA == token0
            ? (amountA, amountB)
            : (amountB, amountA);

        IERC20(token0).approve(pair, amount0);
        IERC20(token1).approve(pair, amount1);
        UniswapV2Pair(pair).addLiquidity(amount0, amount1);

        liquidity = 0;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 /*amountTokenMin*/,
        uint256 /*amountETHMin*/,
        address /*to*/,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(deadline >= block.timestamp, "EXPIRED");

        amountToken = amountTokenDesired;
        amountETH = msg.value;

        address pair = _ensurePair(token, WETH);

        require(IERC20(token).transferFrom(msg.sender, address(this), amountToken), "pull token");
        WETH9(payable(WETH)).deposit{value: amountETH}();

        (address token0, address token1) = token < WETH ? (token, WETH) : (WETH, token);
        (uint256 amount0, uint256 amount1) = token == token0
            ? (amountToken, amountETH)
            : (amountETH, amountToken);

        IERC20(token0).approve(pair, amount0);
        IERC20(token1).approve(pair, amount1);
        UniswapV2Pair(pair).addLiquidity(amount0, amount1);

        liquidity = 0;
    }
}

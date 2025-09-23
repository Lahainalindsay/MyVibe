// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockV2Pair {
    address public immutable token0;
    address public immutable token1;

    uint112 private reserve0; // token0 reserve
    uint112 private reserve1; // token1 reserve

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, address indexed tokenIn, uint256 amountIn, address indexed to, uint256 amountOut);

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() external view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    function _updateReserves() internal {
        reserve0 = uint112(IERC20(token0).balanceOf(address(this)));
        reserve1 = uint112(IERC20(token1).balanceOf(address(this)));
    }

    function addLiquidity(uint256 amount0, uint256 amount1) external {
        require(IERC20(token0).transferFrom(msg.sender, address(this), amount0), "t0 xferFrom");
        require(IERC20(token1).transferFrom(msg.sender, address(this), amount1), "t1 xferFrom");
        _updateReserves();
        emit LiquidityAdded(msg.sender, amount0, amount1);
    }

    function swap(address tokenIn, uint256 amountIn, address to) external returns (uint256 amountOut) {
        require(to != address(0), "to");
        require(tokenIn == token0 || tokenIn == token1, "tokenIn");

        uint256 bal0Before = IERC20(token0).balanceOf(address(this));
        uint256 bal1Before = IERC20(token1).balanceOf(address(this));

        // Pull tokenIn from caller
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "xferFrom in");

        uint256 bal0After = IERC20(token0).balanceOf(address(this));
        uint256 bal1After = IERC20(token1).balanceOf(address(this));

        bool inIs0 = tokenIn == token0;
        uint256 inDelta = inIs0 ? (bal0After - bal0Before) : (bal1After - bal1Before);

        uint256 rIn = inIs0 ? bal0Before : bal1Before;
        uint256 rOut = inIs0 ? bal1Before : bal0Before;
        require(rOut > 0 && rIn > 0, "no liq");

        uint256 inWithFee = inDelta * 997;
        amountOut = (inWithFee * rOut) / (rIn * 1000 + inWithFee);
        require(amountOut > 0, "no out");

        address tokenOut = inIs0 ? token1 : token0;
        require(IERC20(tokenOut).transfer(to, amountOut), "xfer out");
        _updateReserves();
        emit Swap(msg.sender, tokenIn, inDelta, to, amountOut);
    }
}


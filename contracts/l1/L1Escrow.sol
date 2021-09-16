pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L1Escrow {

  IERC20 dai;

  constructor(IERC20 _dai) {
    dai = _dai;
  }

  function getDAIAddress() external view returns (IERC20) {
    return dai;
  }

  function approve(uint256 amount) external {
    dai.approve(address(this), amount);
  }
}

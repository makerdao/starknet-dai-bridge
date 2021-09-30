// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface TokenLike {
  function transferFrom(
    address _from, address _to, uint256 _value
  ) external returns (bool success);
}

interface StarkNetLike {
  function sendMessageToL2(
    uint256 to_address,
    uint256 selector,
    uint256[] calldata payload
  ) external;
  function consumeMessageFromL2(
    uint256 from_address,
    uint256[] calldata payload
  ) external;
}

contract L1DAIBridge {
  address public immutable starkNet;
  address public immutable dai;
  address public immutable escrow;
  uint256 public immutable l2DaiBridge;

  uint256 constant MESSAGE_WITHDRAW = 0;
  uint256 constant DEPOSIT_SELECTOR = 1;

  constructor(address _starkNet, address _dai, address _escrow, uint256 _l2DaiBridge) {
    starkNet = _starkNet;
    dai = _dai;
    escrow = _escrow;
    l2DaiBridge = _l2DaiBridge;
  }

  function deposit(
    address from,
    uint256 to,
    uint256 amount
  ) external {
    TokenLike(dai).transferFrom(from, escrow, amount);

    uint256[] memory payload = new uint256[](2);
    payload[0] = to;
    payload[1] = amount;

    StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, DEPOSIT_SELECTOR, payload);
  }

  function finalizeWithdrawal(address to, uint256 amount) external {

    uint256[] memory payload = new uint256[](3);
    payload[0] = MESSAGE_WITHDRAW;
    payload[1] = uint256(uint160(to));
    payload[2] = amount;

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiBridge, payload);
    TokenLike(dai).transferFrom(escrow, to, amount);
  }
}

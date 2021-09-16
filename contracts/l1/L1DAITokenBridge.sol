pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStarknetCore {

  function sendMessageToL2(
    uint256 to_address,
    uint256 selector,
    uint256[] calldata payload
  ) external;

  function consumeMessageFromL2(uint256 fromAddress, uint256[] calldata payload) external;
}

interface IL1Escrow {
  function getDAIAddress() external view returns (IERC20);
}

contract L1DAITokenBridge {

  IStarknetCore starknetCore;
  IERC20 dai;
  IL1Escrow escrow;

  uint256 l2ContractAddress;

  uint256 constant MESSAGE_WITHDRAW = 0;

  uint256 constant DEPOSIT_SELECTOR = 1;

  constructor(IStarknetCore _starknetCore, IL1Escrow _escrow) {
    starknetCore = _starknetCore;
    escrow = _escrow;
    dai = escrow.getDAIAddress();
  }

  function initialize(uint256 _l2ContractAddress) external {
    l2ContractAddress = _l2ContractAddress;
  }

  function deposit(
    address l1Address,
    uint256 l2Address,
    uint256 amount
  ) external {

    uint256[] memory payload = new uint256[](2);

    payload[0] = l2Address;
    payload[1] = amount;

    // check that bridge is open

    starknetCore.sendMessageToL2(l2ContractAddress, DEPOSIT_SELECTOR, payload);

    // transfer funds on DAI contract user -> escrow
    dai.transferFrom(l1Address, address(escrow), amount);
  }

  function finalizeWithdrawal(address l1Address, uint256 amount) external {

    uint256[] memory payload = new uint256[](2);

    // convert l1Address to uint256
    uint256 l1AddressInt = 0;
    payload[0] = l1AddressInt;
    payload[1] = amount;

    starknetCore.consumeMessageFromL2(l2ContractAddress, payload);

    // transfer funds on DAI contract escrow -> user
    dai.transferFrom(address(escrow), l1Address, amount);
  }
}

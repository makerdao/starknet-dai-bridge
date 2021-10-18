// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface TokenLike {
  function transferFrom(
    address _from, address _to, uint256 _value
  ) external returns (bool success);
  function balanceOf(
    address account
  ) external view returns (uint256);
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
   // --- Auth ---
  mapping (address => uint256) public wards;
  function rely(address usr) external auth {
    wards[usr] = 1;
    emit Rely(usr);
  }
  function deny(address usr) external auth {
    wards[usr] = 0;
    emit Deny(usr);
  }
  modifier auth {
    require(wards[msg.sender] == 1, "L1DAIBridge/not-authorized");
    _;
  }

  event Rely(address indexed usr);
  event Deny(address indexed usr);


  address public immutable starkNet;
  address public immutable dai;
  address public immutable escrow;
  uint256 public immutable l2DaiBridge;

  uint256 public isOpen = 1;
  uint256 public ceiling = 0;

  uint256 constant MESSAGE_WITHDRAW = 0;

  //  from starkware.starknet.compiler.compile import get_selector_from_name
  //  print(get_selector_from_name('finalizeDeposit'))
  uint256 constant DEPOSIT_SELECTOR = 1719001440962431497946253267335313592375607408367068470900111420804409451977;
  //  print(get_selector_from_name('finalizeRequestWithdrawal'))
  uint256 constant FINALIZE_WITHDRAW_SELECTOR = 445294147998055781766362018077835583743363152459026443725942079426086721020;

  event Closed();
  event Deposit(address indexed from, uint256 indexed to, uint256 amount);
  event FinalizeWithdrawal(address indexed to, uint256 amount);
  event RequestWithdrawal(address indexed to, uint256 indexed from, uint256 amount);
  event Ceiling(uint256 ceiling);

  constructor(address _starkNet, address _dai, address _escrow, uint256 _l2DaiBridge) {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    starkNet = _starkNet;
    dai = _dai;
    escrow = _escrow;
    l2DaiBridge = _l2DaiBridge;
  }

  function close() external auth {
    isOpen = 0;
    emit Closed();
  }

  function setCeiling(uint256 _ceiling) external auth {
    ceiling = _ceiling;
    emit Ceiling(_ceiling);
  }

  function deposit(
    address from,
    uint256 to,
    uint256 amount
  ) external {
    require(isOpen == 1, "L1DAIBridge/closed");

    TokenLike(dai).transferFrom(from, escrow, amount);

    require(TokenLike(dai).balanceOf(escrow) <= ceiling, "L1DAIBridge/above-ceiling");

    uint256[] memory payload = new uint256[](2);
    payload[0] = to;
    payload[1] = amount;

    StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, DEPOSIT_SELECTOR, payload);

    emit Deposit(from, to, amount);
  }

  function finalizeWithdrawal(address to, uint256 amount) external {

    uint256[] memory payload = new uint256[](3);
    payload[0] = MESSAGE_WITHDRAW;
    payload[1] = uint256(uint160(msg.sender));
    payload[2] = amount;

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiBridge, payload);
    TokenLike(dai).transferFrom(escrow, to, amount);

    emit FinalizeWithdrawal(to, amount);
  }

  function requestWithdrawal(uint256 from, uint256 amount) external {

    uint256[] memory payload = new uint256[](3);
    payload[0] = from;
    payload[1] = uint256(uint160(msg.sender));
    payload[2] = amount;

    StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, FINALIZE_WITHDRAW_SELECTOR, payload);

    emit RequestWithdrawal(msg.sender, from, amount);
  }
}

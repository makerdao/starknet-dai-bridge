// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

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

contract L1GovernanceRelay {
  // --- Auth ---
  mapping(address => uint256) public wards;

  function rely(address usr) external auth {
    wards[usr] = 1;
    emit Rely(usr);
  }

  function deny(address usr) external auth {
    wards[usr] = 0;
    emit Deny(usr);
  }

  modifier auth() {
    require(wards[msg.sender] == 1, "L1GovernanceRelay/not-authorized");
    _;
  }

  uint256 constant RELAY_SELECTOR = 300224956480472355485152391090755024345070441743081995053718200325371913697;
  uint256 constant RELY_SELECTOR = 1496536124238287716823880339464828645384760243085392191791554724922079220400;
  uint256 constant DENY_SELECTOR = 1405354272814642791807791490850870027727270009409301426028607061893467956449;

  address public immutable l2GovernanceRelay;

  event Rely(address indexed usr);
  event Deny(address indexed usr);

  address public immutable starkNet;

  constructor(address _starkNet, address _l2GovernanceRelay) {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    starkNet = _starkNet;
    l2GovernanceRelay = _l2GovernanceRelay;
  }

  function rely(
    uint256 target,
  ) external auth {
    uint256[] memory payload = new uint256[](1);
    payload[0] = target;

    StarkNetLike(starkNet).sendMessageToL2(l2GovernanceRelay, RELY_SELECTOR, payload);
  }

  function deny(
    uint256 target,
  ) external auth {
    uint256[] memory payload = new uint256[](1);
    payload[0] = target;

    StarkNetLike(starkNet).sendMessageToL2(l2GovernanceRelay, DENY_SELECTOR, payload);
  }

  // Forward a call to be repeated on L2
  function relay(
    uint256 to,
    uint256 selector,
    uint256[] calldata
  ) external auth {
    uint256 payloadSize = 3 + calldata.length;
    uint256[] memory payload = new uint256[](payloadSize);
    payload[0] = to;
    payload[1] = selector;
    payload[2] = calldata.length;
    for (uint i = 0; i < calldata.length; i++) {
      payload[i+3] = calldata[i];
    }

    StarkNetLike(starkNet).sendMessageToL2(l2GovernanceRelay, RELAY_SELECTOR, payload);
  }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.7.6;

import "./L1DAIBridge.sol";

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

  event Rely(address indexed usr);
  event Deny(address indexed usr);

  uint256 constant RELAY_SELECTOR = 300224956480472355485152391090755024345070441743081995053718200325371913697;

  address public immutable starkNet;
  uint256 public immutable l2GovernanceRelay;

  constructor(address _starkNet, uint256 _l2GovernanceRelay) {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    starkNet = _starkNet;
    l2GovernanceRelay = _l2GovernanceRelay;
  }

  // Forward a call to be repeated on L2
  function relay(
    uint256 to,
    uint256 selector
  ) external auth {
    uint256[] memory payload = new uint256[](2);
    payload[0] = to;
    payload[1] = selector;

    StarkNetLike(starkNet).sendMessageToL2(l2GovernanceRelay, RELAY_SELECTOR, payload);
  }
}

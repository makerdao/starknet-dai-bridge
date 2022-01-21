// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity ^0.7.6;

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
  function relay(uint256 spell) external auth {
    uint256[] memory payload = new uint256[](1);
    payload[0] = spell;
    StarkNetLike(starkNet).sendMessageToL2(l2GovernanceRelay, RELAY_SELECTOR, payload);
  }
}

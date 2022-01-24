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
pragma abicoder v2;

import "./WormholeGUID.sol";
import "./interfaces.sol";

contract L1DAIWormholeBridge {
  address public immutable starkNet;
  address public immutable dai;
  uint256 public immutable l2DaiWormholeBridge;
  address public immutable escrow;
  WormholeRouter public immutable wormholeRouter;

  uint256 constant HANDLE_REGISTER_WORMHOLE = 0;
  uint256 constant HANDLE_FLUSH = 1;

  constructor(
    address _starkNet,
    address _dai,
    uint256 _l2DaiWormholeBridge,
    address _escrow,
    address _wormholeRouter
  ) {

    starkNet = _starkNet;
    dai = _dai;
    l2DaiWormholeBridge = _l2DaiWormholeBridge;
    escrow = _escrow;
    wormholeRouter = WormholeRouter(_wormholeRouter);
    // Approve the router to pull DAI from this contract during settle() (after the DAI has been pulled by this contract from the escrow)
    ApproveLike(_dai).approve(_wormholeRouter, type(uint256).max);
  }

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush)
    external
  {
    uint256[] memory payload = new uint256[](4);
    payload[0] = HANDLE_FLUSH;
    payload[1] = uint256(targetDomain);
    (payload[2], payload[3]) = toSplitUint(daiToFlush);

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiWormholeBridge, payload);

    // Pull DAI from the escrow to this contract
    TokenLike(dai).transferFrom(escrow, address(this), daiToFlush);
    // The router will pull the DAI from this contract
    wormholeRouter.settle(targetDomain, daiToFlush);
  }

  function finalizeRegisterWormhole(WormholeGUID calldata wormhole)
    external
  {
    uint256[] memory payload = new uint256[](6);
    payload[0] = HANDLE_REGISTER_WORMHOLE;
    payload[1] = uint256(wormhole.sourceDomain); // bytes32 -> uint256
    payload[2] = uint256(wormhole.targetDomain); // bytes32 -> uint256
    payload[3] = uint256(wormhole.receiver); // bytes32 -> uint256
    payload[4] = uint256(wormhole.operator); // bytes32 -> uint256
    payload[5] = uint256(wormhole.amount); // uint128 -> uint256
    payload[6] = uint256(wormhole.nonce); // uint80 -> uint256
    payload[7] = uint256(wormhole.timestamp); // uint48 -> uint256

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiWormholeBridge, payload);
    
    wormholeRouter.requestMint(wormhole, 0);
  }

  function toSplitUint(uint256 value) internal pure returns (uint256, uint256) {
    uint256 low = value & ((1 << 128) - 1);
    uint256 high = value >> 128;
    return (low, high);
  }
}

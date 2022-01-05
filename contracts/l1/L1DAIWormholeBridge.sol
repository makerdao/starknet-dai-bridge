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

import {WormholeGUID} from "./WormholeGUID.sol";

interface WormholeRouter {
  function requestMint(WormoholeGUID calldata womrholeGUID, uint256 maxFee) external;

  function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external;
}

interface TokenLIke {
  function approve(address, uint256) external;

  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DAIWormholeBridge {
  address public immutable starkNet;
  address public immutable l1Token;
  address public immutable l2DAIWormholeBridge;
  address public immutable escrow;
  WormholeRouter public immutable wormholeRouter;

  uint256 constant HANDLE_REGISTER_WORMHOLE = 0;
  uint256 constant HANDLE_FLUSH = 1;

  constructor(
    address _starkNet,
    address _l1Token,
    address _l2DAIWormholeBridge,
    address _l1messenger,
    address _escrow,
    address _wormholeRouter
  ) {

    starkNet = _starkNet;
    l1Token = _l1Token;
    l2DAIWormholeBridge = _l2DAIWormholeBridge;
    escrow = _escrow;
    wormholeRouter = WormholeRouter(_wormholeRouter);
    // Approve the router to pull DAI from this contract during settle() (after the DAI has been pulled by this contract from the escrow)
    TokenLike(_l1Token).approve(_wormholeRouter, type(uint256).max);
  }

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush)
    external
  {
    uint256[] memory payload = new uint256[](4);
    payload[0] = HANDLE_FLUSH;
    payload[1] = targetDomain;
    (payload[2], payload[3]) = toSplitUint(amount);

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiWormholeBridge, payload);

    // Pull DAI from the escrow to this contract
    TokenLIke(l1Token).transferFrom(escrow, address(this), daiToFlush);
    // The router will pull the DAI from this contract
    wormholeRouter.settle(targetDomain, daiToFlush);
  }

  function finalizeRegisterWormhole(WormholeGUID calldata wormhole)
    external
  {
    uint256[] memory payload = new uint256[](2);
    payload[0] = HANDLE_REGISTER_WORMHOLE;
    payload[1] = wormhole;

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiWormholeBridge, payload);
    
    wormholeRouter.requestMint(wormhole, 0);
  }
}

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

pragma solidity ^0.8.14;
pragma abicoder v2;

import "./TeleportGUID.sol";

interface ApproveLike {
  function approve(address, uint256) external returns (bool success);
}

interface TokenLike {
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool success);

    function balanceOf(address account) external view returns (uint256);
}

interface StarkNetLike {
    function sendMessageToL2(
        uint256 to,
        uint256 selector,
        uint256[] calldata payload
    ) external;

    function consumeMessageFromL2(
        uint256 from,
        uint256[] calldata payload
    ) external;
}

interface TeleportRouter {
  function requestMint(
      TeleportGUID calldata teleportGUID,
      uint256 maxFeePercentage,
      uint256 operatorFee
  ) external;

  function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external;
}

contract L1DAITeleportGateway {
  address public immutable starkNet;
  address public immutable dai;
  uint256 public immutable l2DaiTeleportGateway;
  address public immutable escrow;
  TeleportRouter public immutable teleportRouter;

  uint256 constant HANDLE_REGISTER_TELEPORT = 0;
  uint256 constant HANDLE_FLUSH = 1;

  constructor(
    address _starkNet,
    address _dai,
    uint256 _l2DaiTeleportGateway,
    address _escrow,
    address _teleportRouter
  ) {

    starkNet = _starkNet;
    dai = _dai;
    l2DaiTeleportGateway = _l2DaiTeleportGateway;
    escrow = _escrow;
    teleportRouter = TeleportRouter(_teleportRouter);
    // Approve the router to pull DAI from this contract during settle() (after the DAI has been pulled by this contract from the escrow)
    ApproveLike(_dai).approve(_teleportRouter, type(uint256).max);
  }

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush)
    external
  {
    uint256[] memory payload = new uint256[](4);
    payload[0] = HANDLE_FLUSH;
    payload[1] = toL2String(targetDomain);
    (payload[2], payload[3]) = toSplitUint(daiToFlush);

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiTeleportGateway, payload);

    // Pull DAI from the escrow to this contract
    TokenLike(dai).transferFrom(escrow, address(this), daiToFlush);
    // The router will pull the DAI from this contract
    teleportRouter.settle(targetDomain, daiToFlush);
  }

  function finalizeRegisterTeleport(TeleportGUID calldata teleport)
    external
  {
    uint256[] memory payload = new uint256[](8);
    payload[0] = HANDLE_REGISTER_TELEPORT;
    payload[1] = toL2String(teleport.sourceDomain); // bytes32 -> uint256
    payload[2] = toL2String(teleport.targetDomain); // bytes32 -> uint256
    payload[3] = uint256(teleport.receiver); // bytes32 -> uint256
    payload[4] = uint256(teleport.operator); // bytes32 -> uint256
    payload[5] = uint256(teleport.amount); // uint128 -> uint256
    payload[6] = uint256(teleport.nonce); // uint80 -> uint256
    payload[7] = uint256(teleport.timestamp); // uint48 -> uint256

    StarkNetLike(starkNet).consumeMessageFromL2(l2DaiTeleportGateway, payload);

    teleportRouter.requestMint(teleport, 0, 0);
  }

  function toL2String(bytes32 str) internal pure returns (uint256) {
    while (str[31] == '\x00') {
      str = str >> 8;
    }
    return uint256(str);
  }

  function toSplitUint(uint256 value) internal pure returns (uint256, uint256) {
    uint256 low = value & ((1 << 128) - 1);
    uint256 high = value >> 128;
    return (low, high);
  }
}

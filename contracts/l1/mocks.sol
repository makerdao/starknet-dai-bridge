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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./TeleportGUID.sol";

contract DAIMock is ERC20 {
    constructor () ERC20('DAI', 'DAI') {
        _mint(msg.sender, 1_000_000 * 1 ether);
    }
}

// slither-disable-next-line missing-inheritance
contract TeleportRouterMock {

  event RequestMint(TeleportGUID teleportGUID, uint256 maxFeePercentage, uint256 operatorFee);
  event Settle(bytes32 targetDomain, uint256 batchedDaiToFlush);

  function requestMint(
    TeleportGUID calldata teleportGUID,
    uint256 maxFeePercentage,
    uint256 operatorFee
  ) external returns (uint256 postFeeAmount, uint256 totalFee) {
    emit RequestMint(teleportGUID, maxFeePercentage, operatorFee);
    postFeeAmount = maxFeePercentage;
    totalFee = operatorFee;
  }

  function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external {
    emit Settle(targetDomain, batchedDaiToFlush);
  }
}

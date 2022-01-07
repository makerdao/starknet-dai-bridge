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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DAIMock is ERC20 {
    constructor () ERC20('DAI', 'DAI') {
        _mint(msg.sender, 1_000_000 * 1 ether);
    }
}

contract StarkNetMock {
    event LogMessageToL1(
        uint256 indexed from_address,
        address indexed to_address,
        uint256[] payload
    );

    event LogMessageToL2(
        address indexed from_address,
        uint256 indexed to_address,
        uint256 indexed selector,
        uint256[] payload
    );

    event ConsumedMessageToL1(
        uint256 indexed from_address,
        address indexed to_address,
        uint256[] payload
    );

    event ConsumedMessageToL2(
        address indexed from_address,
        uint256 indexed to_address,
        uint256 indexed selector,
        uint256[] payload
    );

    mapping(bytes32 => uint256) public l1ToL2Messages;
    mapping(bytes32 => uint256) public l2ToL1Messages;

    function sendMessageToL2(
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) external returns (bytes32) {
        emit LogMessageToL2(msg.sender, to_address, selector, payload);
        bytes32 msgHash = keccak256(
            abi.encodePacked(uint256(msg.sender), to_address, 1 + payload.length, selector, payload)
        );
        l1ToL2Messages[msgHash] += 1;
        return msgHash;
    }

    function fakeConsumeMessageToL2(
        address sender,
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) external returns (bytes32)
    {
        bytes32 msgHash = keccak256(
            abi.encodePacked(uint256(sender), to_address, 1 + payload.length, selector, payload)
        );
        require(l1ToL2Messages[msgHash] > 0, "INVALID_MESSAGE_TO_CONSUME");
        emit ConsumedMessageToL2(sender, to_address, selector, payload);
        l1ToL2Messages[msgHash] -= 1;
        return msgHash;
    }

    function fakeEnqueueMessageFromL2(
        uint256 from_address,
        address to_address,
        uint256[] calldata payload
    ) external returns (bytes32) {
        emit LogMessageToL1(from_address, to_address, payload);
        bytes32 msgHash = keccak256(
            abi.encodePacked(from_address, to_address, payload.length, payload)
        );
        l2ToL1Messages[msgHash] += 1;
        return msgHash;
    }

    function consumeMessageFromL2(
        uint256 from_address, uint256[] calldata payload
    ) external returns (bytes32)
    {
        bytes32 msgHash = keccak256(
            abi.encodePacked(from_address, uint256(msg.sender), payload.length, payload)
        );

        require(l2ToL1Messages[msgHash] > 0, "INVALID_MESSAGE_TO_CONSUME");
        emit ConsumedMessageToL1(from_address, msg.sender, payload);
        l2ToL1Messages[msgHash] -= 1;
        return msgHash;
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./L1DAIBridge.sol";

contract StarkNetMock is StarkNetLike {
    function sendMessageToL2(
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) override external {
    }
    function consumeMessageFromL2(
        uint256 from_address,
        uint256[] calldata payload
    ) override external {
    }
}

contract DAIMock is ERC20 {
    constructor () ERC20('DAI', 'DAI') {
        _mint(msg.sender, 1_000_000 * 1 ether);
    }
}

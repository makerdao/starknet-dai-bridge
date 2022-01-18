pragma solidity ^0.7.6;

// Standard Maker Wormhole GUID
struct WormholeGUID {
  bytes32 sourceDomain;
  bytes32 targetDomain;
  bytes32 receiver;
  bytes32 operator;
  uint128 amount;
  // uint80 nonce;
  // uint48 timestamp;
}

function bytes32ToAddress(bytes32 addr) pure returns (address) {
  return address(uint160(uint256(addr)));
}

function addressToBytes32(address addr) pure returns (bytes32) {
  return bytes32(uint256(uint160(addr)));
}

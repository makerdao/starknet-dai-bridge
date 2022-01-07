pragma solidity ^0.7.6;

// Standard Maker Wormhole GUID
struct WormholeGUID {
  bytes32 sourceDomain;
  bytes32 targetDomain;
  address receiver;
  address operator;
  uint128 amount;
  // uint80 nonce;
  // uint48 timestamp;
}

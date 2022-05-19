pragma solidity ^0.7.6;

// Standard Maker Teleport GUID
struct TeleportGUID {
  bytes32 sourceDomain;
  bytes32 targetDomain;
  bytes32 receiver;
  bytes32 operator;
  uint128 amount;
  uint80 nonce;
  uint48 timestamp;
}

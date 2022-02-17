// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
//
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

pragma abicoder v2;
pragma solidity ^0.7.6;

import "./WormholeGUID.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface WormholeJoinLike {
    function requestMint(
        WormholeGUID calldata wormholeGUID,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) external returns (uint256 postFeeAmount, uint256 totalFee);
}

interface TokenLike {
    function approve(address, uint256) external returns (bool);
    function mint(address, uint256) external returns (bool);
}

// WormholeOracleAuth provides user authentication for WormholeJoin, by means of Maker Oracle Attestations
contract WormholeOracleAuth is ERC20 {

    mapping (address => uint256) public wards;   // Auth
    mapping (address => uint256) public signers; // Oracle feeds

    TokenLike immutable public dai;

    uint256 public threshold;

    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event File(bytes32 indexed what, uint256 data);
    event SignersAdded(address[] signers);
    event SignersRemoved(address[] signers);

    modifier auth {
        require(wards[msg.sender] == 1, "WormholeOracleAuth/non-authed");
        _;
    }

    constructor(address dai_) ERC20('OracleTest', 'OracleTest') {
        wards[msg.sender] = 1;
        emit Rely(msg.sender);
        dai = TokenLike(dai_);
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    function file(bytes32 what, uint256 data) external auth {
        if (what == "threshold") {
            threshold = data;
        } else {
            revert("WormholeOracleAuth/file-unrecognized-param");
        }
        emit File(what, data);
    }

    function addSigners(address[] calldata signers_) external auth {
        for(uint i; i < signers_.length; i++) {
            signers[signers_[i]] = 1;
        }
        emit SignersAdded(signers_);
    }

    function removeSigners(address[] calldata signers_) external auth {
        for(uint i; i < signers_.length; i++) {
            signers[signers_[i]] = 0;
        }
        emit SignersRemoved(signers_);
    }

    /**
     * @notice Verify oracle signatures and call WormholeJoin to mint DAI if the signatures are valid
     * @param wormholeGUID The wormhole GUID to register
     * @param signatures The byte array of concatenated signatures ordered by increasing signer addresses.
     * Each signature is {bytes32 r}{bytes32 s}{uint8 v}
     * @param maxFeePercentage Max percentage of the withdrawn amount (in WAD) to be paid as fee (e.g 1% = 0.01 * WAD)
     * @param operatorFee The amount of DAI to pay to the operator
     * @return postFeeAmount The amount of DAI sent to the receiver after taking out fees
     */
    function requestMint(
        WormholeGUID calldata wormholeGUID,
        bytes calldata signatures,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) external returns (uint256 postFeeAmount, uint256 totalFee) {
        require(bytes32ToAddress(wormholeGUID.receiver) == msg.sender || 
            bytes32ToAddress(wormholeGUID.operator) == msg.sender, "WormholeOracleAuth/not-receiver-nor-operator");
        require(isValid(getSignHash(wormholeGUID), signatures, threshold), "WormholeOracleAuth/not-enough-valid-sig");
        dai.mint(bytes32ToAddress(wormholeGUID.receiver), wormholeGUID.amount);
        return (maxFeePercentage, operatorFee);
    }

    /**
     * @notice Returns true if `signatures` contains at least `threshold_` valid signatures of a given `signHash`
     * @param signHash The signed message hash
     * @param signatures The byte array of concatenated signatures ordered by increasing signer addresses.
     * Each signature is {bytes32 r}{bytes32 s}{uint8 v}
     * @param threshold_ The minimum number of valid signatures required for the method to return true
     */
    function isValid(bytes32 signHash, bytes calldata signatures, uint threshold_) public view returns (bool valid) {
        uint256 count = signatures.length / 65;
        require(count >= threshold_, "WormholeOracleAuth/not-enough-sig");

        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 numValid;
        address lastSigner;
        for (uint256 i; i < count;) {
            (v,r,s) = splitSignature(signatures, i);
            address recovered = ecrecover(signHash, v, r, s);
            require(recovered > lastSigner, "WormholeOracleAuth/bad-sig-order"); // make sure signers are different
            lastSigner = recovered;
            if (signers[recovered] == 1) {
                numValid += 1;
                if (numValid >= threshold_) {
                    return true;
                }
            }
            i++;
        }
    }
    
    /**
     * @notice This has to match what oracles are signing
     * @param wormholeGUID The wormhole GUID to calculate hash
     */
    function getSignHash(WormholeGUID memory wormholeGUID) public pure returns (bytes32 signHash) {
        signHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            getGUIDHash(wormholeGUID)
        ));
    }

    /**
     * @notice Parses the signatures and extract (r, s, v) for a signature at a given index.
     * @param signatures concatenated signatures. Each signature is {bytes32 r}{bytes32 s}{uint8 v}
     * @param index which signature to read (0, 1, 2, ...)
     */
    function splitSignature(bytes calldata signatures, uint256 index) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        // we jump signatures.offset to get the first slot of signatures content
        // we jump 65 (0x41) per signature
        // for v we load 32 bytes ending with v (the first 31 come from s) then apply a mask
        uint256 start;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            start := mul(0x41, index)
            r := calldataload(add(signatures.offset, start))
            s := calldataload(add(signatures.offset, add(0x20, start)))
            v := and(calldataload(add(signatures.offset, add(0x21, start))), 0xff)
        }
        require(v == 27 || v == 28, "WormholeOracleAuth/bad-v");
    }
}

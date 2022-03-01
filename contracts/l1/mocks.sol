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
import "./WormholeGUID.sol";
import "./utils/EnumerableSet.sol";

contract DAIMock is ERC20 {
    constructor () ERC20('DAI', 'DAI') {
        _mint(msg.sender, 1_000_000 * 1 ether);
    }
}

interface TokenLike {
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
  function approve(address, uint256) external returns (bool);
  function mint(address, uint256) external returns (bool);
}

interface VatLike {
    function dai(address) external view returns (uint256);
    function live() external view returns (uint256);
    function urns(bytes32, address) external view returns (uint256, uint256);
    function frob(bytes32, address, address, address, int256, int256) external;
    function hope(address) external;
    function move(address, address, uint256) external;
    function nope(address) external;
    function slip(bytes32, address, int256) external;
}

interface DaiJoinLike {
    function dai() external view returns (TokenLike);
    function exit(address, uint256) external;
    function join(address, uint256) external;
}

interface FeesLike {
    function getFee(WormholeGUID calldata, uint256, int256, uint256, uint256) external view returns (uint256);
}

interface GatewayLike {
    function requestMint(
        WormholeGUID calldata wormholeGUID,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) external returns (uint256 postFeeAmount);
    function settle(bytes32 sourceDomain, uint256 batchedDaiToFlush) external;
}

interface IStarknetMessaging {
    // This event needs to be compatible with the one defined in Output.sol.
    event LogMessageToL1(
        uint256 indexed from_address,
        address indexed to_address,
        uint256[] payload
    );

    // An event that is raised when a message is sent from L1 to L2.
    event LogMessageToL2(
        address indexed from_address,
        uint256 indexed to_address,
        uint256 indexed selector,
        uint256[] payload,
        uint256 nonce
    );

    // An event that is raised when a message from L2 to L1 is consumed.
    event ConsumedMessageToL1(
        uint256 indexed from_address,
        address indexed to_address,
        uint256[] payload
    );

    // An event that is raised when a message from L1 to L2 is consumed.
    event ConsumedMessageToL2(
        address indexed from_address,
        uint256 indexed to_address,
        uint256 indexed selector,
        uint256[] payload,
        uint256 nonce
    );

    /**
      Sends a message to an L2 contract.
      Returns the hash of the message.
    */
    function sendMessageToL2(
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) external returns (bytes32);

    /**
      Consumes a message that was sent from an L2 contract.
      Returns the hash of the message.
    */
    function consumeMessageFromL2(uint256 fromAddress, uint256[] calldata payload)
        external
        returns (bytes32);
}

library NamedStorage {
    function bytes32ToUint256Mapping(string memory tag_)
        internal
        pure
        returns (mapping(bytes32 => uint256) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function bytes32ToAddressMapping(string memory tag_)
        internal
        pure
        returns (mapping(bytes32 => address) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function addressToBoolMapping(string memory tag_)
        internal
        pure
        returns (mapping(address => bool) storage randomVariable)
    {
        bytes32 location = keccak256(abi.encodePacked(tag_));
        assembly {
            randomVariable.slot := location
        }
    }

    function getUintValue(string memory tag_) internal view returns (uint256 retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setUintValue(string memory tag_, uint256 value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }

    function setUintValueOnce(string memory tag_, uint256 value) internal {
        require(getUintValue(tag_) == 0, "ALREADY_SET");
        setUintValue(tag_, value);
    }

    function getAddressValue(string memory tag_) internal view returns (address retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setAddressValue(string memory tag_, address value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }

    function setAddressValueOnce(string memory tag_, address value) internal {
        require(getAddressValue(tag_) == address(0x0), "ALREADY_SET");
        setAddressValue(tag_, value);
    }

    function getBoolValue(string memory tag_) internal view returns (bool retVal) {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            retVal := sload(slot)
        }
    }

    function setBoolValue(string memory tag_, bool value) internal {
        bytes32 slot = keccak256(abi.encodePacked(tag_));
        assembly {
            sstore(slot, value)
        }
    }
}

contract StarknetMessaging is IStarknetMessaging {
    string constant L1L2_MESSAGE_MAP_TAG = "STARKNET_1.0_MSGING_L1TOL2_MAPPPING_V2";
    string constant L2L1_MESSAGE_MAP_TAG = "STARKNET_1.0_MSGING_L2TOL1_MAPPPING";

    string constant L1L2_MESSAGE_NONCE_TAG = "STARKNET_1.0_MSGING_L1TOL2_NONCE";

    function l1ToL2Messages(bytes32 msgHash) external view returns (uint256) {
        return l1ToL2Messages()[msgHash];
    }

    function l2ToL1Messages(bytes32 msgHash) external view returns (uint256) {
        return l2ToL1Messages()[msgHash];
    }

    function l1ToL2Messages() internal pure returns (mapping(bytes32 => uint256) storage) {
        return NamedStorage.bytes32ToUint256Mapping(L1L2_MESSAGE_MAP_TAG);
    }

    function l2ToL1Messages() internal pure returns (mapping(bytes32 => uint256) storage) {
        return NamedStorage.bytes32ToUint256Mapping(L2L1_MESSAGE_MAP_TAG);
    }

    function l1ToL2MessageNonce() public view returns (uint256) {
        return NamedStorage.getUintValue(L1L2_MESSAGE_NONCE_TAG);
    }

    /**
      Sends a message to an L2 contract.
    */
    function sendMessageToL2(
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) external override returns (bytes32) {
        uint256 nonce = l1ToL2MessageNonce();
        NamedStorage.setUintValue(L1L2_MESSAGE_NONCE_TAG, nonce + 1);
        emit LogMessageToL2(msg.sender, to_address, selector, payload, nonce);
        bytes32 msgHash = keccak256(
            abi.encodePacked(
                uint256(msg.sender),
                to_address,
                nonce,
                selector,
                payload.length,
                payload
            )
        );
        l1ToL2Messages()[msgHash] += 1;

        return msgHash;
    }

    /**
      Consumes a message that was sent from an L2 contract.
      Returns the hash of the message.
    */
    function consumeMessageFromL2(uint256 from_address, uint256[] calldata payload)
        external
        override
        returns (bytes32)
    {
        bytes32 msgHash = keccak256(
            abi.encodePacked(from_address, uint256(msg.sender), payload.length, payload)
        );

        require(l2ToL1Messages()[msgHash] > 0, "INVALID_MESSAGE_TO_CONSUME");
        emit ConsumedMessageToL1(from_address, msg.sender, payload);
        l2ToL1Messages()[msgHash] -= 1;
        return msgHash;
    }
}

contract MockStarknetMessaging is StarknetMessaging {
    /**
      Mocks a message from L2 to L1.
    */
    function mockSendMessageFromL2(
        uint256 from_address,
        uint256 to_address,
        uint256[] calldata payload
    ) external {
        bytes32 msgHash = keccak256(
            abi.encodePacked(from_address, to_address, payload.length, payload)
        );
        l2ToL1Messages()[msgHash] += 1;
    }

    /**
      Mocks consumption of a message from L1 to L2.
    */
    function mockConsumeMessageToL2(
        uint256 from_address,
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload,
        uint256 nonce
    ) external {
        bytes32 msgHash = keccak256(
            abi.encodePacked(from_address, to_address, nonce, selector, payload.length, payload)
        );

        require(l1ToL2Messages()[msgHash] > 0, "INVALID_MESSAGE_TO_CONSUME");
        l1ToL2Messages()[msgHash] -= 1;
    }
}

contract MockWormholeRouter {

    using EnumerableSet for EnumerableSet.Bytes32Set;

    mapping (address => uint256) public wards;          // Auth
    mapping (bytes32 => address) public gateways;       // GatewayLike contracts called by the router for each domain
    mapping (address => bytes32) public domains;        // Domains for each gateway

    EnumerableSet.Bytes32Set private allDomains;

    TokenLike immutable public dai; // L1 DAI ERC20 token

    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event File(bytes32 indexed what, bytes32 indexed domain, address data);

    modifier auth {
        require(wards[msg.sender] == 1, "WormholeRouter/non-authed");
        _;
    }

    constructor(address dai_) {
        dai = TokenLike(dai_);
        wards[msg.sender] = 1;
        emit Rely(msg.sender);
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    /**
     * @notice Allows auth to configure the router. The only supported operation is "gateway",
     * which allows adding, replacing or removing a gateway contract for a given domain. The router forwards `settle()` 
     * and `requestMint()` calls to the gateway contract installed for a given domain. Gateway contracts must therefore
     * conform to the GatewayLike interface. Examples of valid gateways include WormholeJoin (for the L1 domain)
     * and L1 bridge contracts (for L2 domains).
     * @dev In addition to updating the mapping `gateways` which maps GatewayLike contracts to domain names and
     * the reverse mapping `domains` which maps domain names to GatewayLike contracts, this method also maintains
     * the enumerable set `allDomains`.
     * @param what The name of the operation. Only "gateway" is supported.
     * @param domain The domain for which a GatewayLike contract is added, replaced or removed.
     * @param data The address of the GatewayLike contract to install for the domain (or address(0) to remove a domain)
     */
    function file(bytes32 what, bytes32 domain, address data) external auth {
        if (what == "gateway") {
            address prevGateway = gateways[domain];
            if(prevGateway == address(0)) { 
                // new domain => add it to allDomains
                if(data != address(0)) {
                    allDomains.add(domain);
                }
            } else { 
                // existing domain 
                domains[prevGateway] = bytes32(0);
                if(data == address(0)) {
                    // => remove domain from allDomains
                    allDomains.remove(domain);
                }
            }

            gateways[domain] = data;
            if(data != address(0)) {
                domains[data] = domain;
            }
        } else {
            revert("WormholeRouter/file-unrecognized-param");
        }
        emit File(what, domain, data);
    }

    function numDomains() external view returns (uint256) {
        return allDomains.length();
    }
    function domainAt(uint256 index) external view returns (bytes32) {
        return allDomains.at(index);
    }
    function hasDomain(bytes32 domain) external view returns (bool) {
        return allDomains.contains(domain);
    }

    /**
     * @notice Call a GatewayLike contract to request the minting of DAI. The sender must be a supported gateway
     * @param wormholeGUID The wormhole GUID to register
     * @param maxFeePercentage Max percentage of the withdrawn amount (in WAD) to be paid as fee (e.g 1% = 0.01 * WAD)
     * @param operatorFee The amount of DAI to pay to the operator
     * @return postFeeAmount The amount of DAI sent to the receiver after taking out fees
     */
    function requestMint(WormholeGUID calldata wormholeGUID, uint256 maxFeePercentage, uint256 operatorFee) external returns (uint256 postFeeAmount) {
        require(msg.sender == gateways[wormholeGUID.sourceDomain], "WormholeRouter/sender-not-gateway");
        address gateway = gateways[wormholeGUID.targetDomain];
        require(gateway != address(0), "WormholeRouter/unsupported-target-domain");
        return GatewayLike(gateway).requestMint(wormholeGUID, maxFeePercentage, operatorFee);
    }

    /**
     * @notice Call a GatewayLike contract to settle a batch of sourceDomain -> targetDomain DAI transfer. 
     * The sender must be a supported gateway
     * @param targetDomain The domain receiving the batch of DAI (only L1 supported for now)
     * @param batchedDaiToFlush The amount of DAI in the batch 
     */
    function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external {
        bytes32 sourceDomain = domains[msg.sender];
        require(sourceDomain != bytes32(0), "WormholeRouter/sender-not-gateway");
        address gateway = gateways[targetDomain];
        require(gateway != address(0), "WormholeRouter/unsupported-target-domain");
         // Forward the DAI to settle to the gateway contract
        dai.transferFrom(msg.sender, gateway, batchedDaiToFlush);
        GatewayLike(gateway).settle(sourceDomain, batchedDaiToFlush);
    }
}

// Primary control for extending Wormhole credit
contract WormholeJoin {
    mapping (address =>        uint256) public wards;     // Auth
    mapping (bytes32 =>        address) public fees;      // Fees contract per source domain
    mapping (bytes32 =>        uint256) public line;      // Debt ceiling per source domain
    mapping (bytes32 =>         int256) public debt;      // Outstanding debt per source domain (can be < 0 when settlement occurs before mint)
    mapping (bytes32 => WormholeStatus) public wormholes; // Approved wormholes and pending unpaid

    address public vow;

    // VatLike     immutable public vat;
    // DaiJoinLike immutable public daiJoin;
    // bytes32     immutable public ilk;
    TokenLike immutable public dai;
    bytes32     immutable public domain;

    uint256 constant public WAD = 10 ** 18;
    uint256 constant public RAY = 10 ** 27;

    event Rely(address indexed usr);
    event Deny(address indexed usr);
    event File(bytes32 indexed what, address data);
    event File(bytes32 indexed what, bytes32 indexed domain, address data);
    event File(bytes32 indexed what, bytes32 indexed domain, uint256 data);
    event Register(bytes32 indexed hashGUID, WormholeGUID wormholeGUID);
    event Withdraw(bytes32 indexed hashGUID, WormholeGUID wormholeGUID, uint256 amount, uint256 maxFeePercentage, uint256 operatorFee);
    event Settle(bytes32 indexed sourceDomain, uint256 batchedDaiToFlush);

    struct WormholeStatus {
        bool    blessed;
        uint248 pending;
    }

    constructor(address dai_, bytes32 domain_) {
        wards[msg.sender] = 1;
        emit Rely(msg.sender);
        // vat = VatLike(vat_);
        // daiJoin = DaiJoinLike(daiJoin_);
        // vat.hope(daiJoin_);
        // daiJoin.dai().approve(daiJoin_, type(uint256).max);
        // ilk = ilk_;
        dai = TokenLike(dai_);
        domain = domain_;
    }

    function _min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x <= y ? x : y;
    }

    modifier auth {
        require(wards[msg.sender] == 1, "WormholeJoin/non-authed");
        _;
    }

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    function file(bytes32 what, address data) external auth {
        if (what == "vow") {
            vow = data;
        } else {
            revert("WormholeJoin/file-unrecognized-param");
        }
        emit File(what, data);
    }

    function file(bytes32 what, bytes32 domain_, address data) external auth {
        if (what == "fees") {
            fees[domain_] = data;
        } else {
            revert("WormholeJoin/file-unrecognized-param");
        }
        emit File(what, domain_, data);
    }

    function file(bytes32 what, bytes32 domain_, uint256 data) external auth {
        if (what == "line") {
            require(data <= 2 ** 255 - 1, "WormholeJoin/not-allowed-bigger-int256");
            line[domain_] = data;
        } else {
            revert("WormholeJoin/file-unrecognized-param");
        }
        emit File(what, domain_, data);
    }

    /**
    * @dev External view function to get the total debt used by this contract
    **/
    /*
    function cure() external view returns (uint256) {
        (, uint256 art) = vat.urns(ilk, address(this)); // rate == RAY => normalized debt == actual debt
        return art * RAY;
    }
    */

    /**
    * @dev Internal function that executes the mint after a wormhole is registered
    * @param wormholeGUID Struct which contains the whole wormhole data
    * @param hashGUID Hash of the prev struct
    * @param maxFeePercentage Max percentage of the withdrawn amount (in WAD) to be paid as fee (e.g 1% = 0.01 * WAD)
    * @param operatorFee The amount of DAI to pay to the operator
    * @return postFeeAmount The amount of DAI sent to the receiver after taking out fees
    **/
    /*
    function _mint(
        WormholeGUID calldata wormholeGUID,
        bytes32 hashGUID,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) internal returns (uint256 postFeeAmount, uint256 totalFee) {
        require(wormholeGUID.targetDomain == domain, "WormholeJoin/incorrect-domain");

        emit Withdraw(hashGUID, wormholeGUID, amtToTake, maxFeePercentage, operatorFee);
    }
    */

    /**
    * @dev External authed function that registers the wormwhole and executes the mint after
    * @param wormholeGUID Struct which contains the whole wormhole data
    * @param maxFeePercentage Max percentage of the withdrawn amount (in WAD) to be paid as fee (e.g 1% = 0.01 * WAD)
    * @param operatorFee The amount of DAI to pay to the operator
    * @return postFeeAmount The amount of DAI sent to the receiver after taking out fees
    **/
    function requestMint(
        WormholeGUID calldata wormholeGUID,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) external returns (uint256 postFeeAmount, uint256 totalFee) {
        /*
        bytes32 hashGUID = getGUIDHash(wormholeGUID);
        require(!wormholes[hashGUID].blessed, "WormholeJoin/already-blessed");
        wormholes[hashGUID].blessed = true;
        wormholes[hashGUID].pending = wormholeGUID.amount;
        emit Register(hashGUID, wormholeGUID);
        //return _mint(wormholeGUID, hashGUID, maxFeePercentage, operatorFee);
        */
        dai.mint(bytes32ToAddress(wormholeGUID.receiver), wormholeGUID.amount);
        return (maxFeePercentage, operatorFee);
    }

    /**
    * @dev External function that executes the mint of any pending and available amount (only callable by operator)
    * @param wormholeGUID Struct which contains the whole wormhole data
    * @param maxFeePercentage Max percentage of the withdrawn amount (in WAD) to be paid as fee (e.g 1% = 0.01 * WAD)
    * @param operatorFee The amount of DAI to pay to the operator
    * @return postFeeAmount The amount of DAI sent to the receiver after taking out fees
    **/
    /*
    function mintPending(
        WormholeGUID calldata wormholeGUID,
        uint256 maxFeePercentage,
        uint256 operatorFee
    ) external returns (uint256 postFeeAmount, uint256 totalFee) {
        require(bytes32ToAddress(wormholeGUID.receiver) == msg.sender || 
            bytes32ToAddress(wormholeGUID.operator) == msg.sender, "WormholeJoin/not-receiver-nor-operator");
        return _mint(wormholeGUID, getGUIDHash(wormholeGUID), maxFeePercentage, operatorFee);
    }
    */

    /**
    * @dev External function that repays debt with DAI previously pushed to this contract (in general coming from the bridges)
    * @param sourceDomain domain where the DAI is coming from
    * @param batchedDaiToFlush Amount of DAI that is being processed for repayment
    **/
    /*
    function settle(bytes32 sourceDomain, uint256 batchedDaiToFlush) external {
        require(batchedDaiToFlush <= 2 ** 255, "WormholeJoin/overflow");
        daiJoin.join(address(this), batchedDaiToFlush);
        if (vat.live() == 1) {
            (, uint256 art) = vat.urns(ilk, address(this)); // rate == RAY => normalized debt == actual debt
            uint256 amtToPayBack = _min(batchedDaiToFlush, art);
            vat.frob(ilk, address(this), address(this), address(this), -int256(amtToPayBack), -int256(amtToPayBack));
            vat.slip(ilk, address(this), -int256(amtToPayBack));
        }
        debt[sourceDomain] -= int256(batchedDaiToFlush);
        emit Settle(sourceDomain, batchedDaiToFlush);
    }
    */
}

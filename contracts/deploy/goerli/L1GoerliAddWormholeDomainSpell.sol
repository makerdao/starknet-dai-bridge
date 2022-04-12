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

pragma solidity ^0.7.6;

import {DssExec} from "../common/DssExec.sol";
import {DssAction} from "../common/DssAction.sol";

interface VatLike {
  function rely(address usr) external;

  function init(bytes32 ilk) external;

  function file(
    bytes32 ilk,
    bytes32 what,
    uint256 data
  ) external;
}

interface WormholeJoinLike {
  function file(bytes32 what, address val) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    address data
  ) external;

  function file(
    bytes32 what,
    bytes32 domain_,
    uint256 data
  ) external;

  function ilk() external returns (bytes32);
}

interface OracleAuthLike {
  function file(bytes32 what, uint256 data) external;

  function addSigners(address[] calldata signers_) external;
}

interface RouterLike {
  function file(
    bytes32 what,
    bytes32 domain,
    address data
  ) external;
}

interface L1EscrowLike {
  function approve(
    address token,
    address spender,
    uint256 value
  ) external;
}

interface GovernanceRelayLike {
  function relay(uint256 spell) external;
}

contract DssSpellAction is DssAction {
  uint256 public constant RAY = 10**27;
  uint256 public constant RAD = 10**45;

  string public constant override description = "Gorli Starknet Wormhole deployment spell";

  function officeHours() public pure override returns (bool) {
    return false;
  }

  // Here is current bridge deployment
  //    {
  //      'account-deployer': '0x035c782a5447a822a3ae179321dc694c8c36a0deb82524248e1e683dce4c2c59',
  //      dai: '0x03e85bfbb8e2a42b7bead9e88e9a1b19dbccf661471061807292120462396ec9',
  //      registry: '0x0009a22467ad5121347d290c8d439d660076bf8e6f836ad4ca607d7637f8c2a5',
  //      L1Escrow: '0x38c3DDF1eF3e045abDDEb94f4e7a1a0d5440EB44',
  //      l2_dai_bridge: '0x0278f24c3e74cbf7a375ec099df306289beb0605a346277d200b791a7f811a19',
  //      L1DAIBridge: '0xd8beAa22894Cd33F24075459cFba287a10a104E4',
  //      l2_governance_relay: '0x030255465a3d33f430ea6e16cb22cc09b9291972f7f8c7198b5e5b1ef522b85c',
  //      L1GovernanceRelay: '0x73c0049Dd6560E644984Fa3Af30A55a02a7D81fB'
  //    }

  // And basic dss-wormhole deployment
  // deployed with: https://github.com/makerdao/wormhole-integration-tests/pull/42
  // Wormhole:  {
  //  "join": "0x7954DA41E6D18e25Ad6365a146091c9D75E4b568",
  //  "oracleAuth": "0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442",
  //  "router": "0xac22Eea777cd98A357f2E2f26e7Acd37651DBA9c",
  //  "constantFee": "0xd40EA2981B350D38281402c058b1Ef1058dbac53",
  //  "relay": "0x29e07B88a51281f3C3CDD9F8De94DfCf7Ff24C7B"
  // }


  function actions() public override {
    bytes32 masterDomain = "GOERLI-MASTER-1";
    WormholeJoinLike wormholeJoin = WormholeJoinLike(0x7954DA41E6D18e25Ad6365a146091c9D75E4b568);
    address vow = 0x23f78612769b9013b3145E43896Fa1578cAa2c2a;
    VatLike vat = VatLike(0xB966002DDAa2Baf48369f5015329750019736031);
    uint256 globalLine = 10000000000 * RAD;
    RouterLike router = RouterLike(0xac22Eea777cd98A357f2E2f26e7Acd37651DBA9c);
    OracleAuthLike oracleAuth = OracleAuthLike(0x70FEdb21fF40E8bAf9f1a631fA9c34F179f29442);
    address[] memory oracles = new address[](5);

    oracles[0] = 0xC4756A9DaE297A046556261Fa3CD922DFC32Db78; // OCU
    oracles[1] = 0x23ce419DcE1De6b3647Ca2484A25F595132DfBd2; // OCU
    oracles[2] = 0x774D5AA0EeE4897a9a6e65Cbed845C13Ffbc6d16; // OCU
    oracles[3] = 0xb41E8d40b7aC4Eb34064E079C8Eca9d7570EBa1d; // OCU
    oracles[4] = 0xc65EF2D17B05ADbd8e4968bCB01b325ab799aBd8; // PECU
    // TODO @nulven add starknet oracle public key

    wormholeJoin.file(bytes32("vow"), vow);
    router.file(bytes32("gateway"), masterDomain, address(wormholeJoin));
    vat.rely(address(wormholeJoin));
    bytes32 ilk = wormholeJoin.ilk();
    vat.init(ilk);
    vat.file(ilk, bytes32("spot"), RAY);
    vat.file(ilk, bytes32("line"), globalLine);
    oracleAuth.file(bytes32("threshold"), 1);
    oracleAuth.addSigners(oracles);

    // configure optimism wormhole
    bytes32 slaveDomain = "GOERLI-SLAVE-STARKNET-1";
    uint256 optimismSlaveLine = 100 * RAD;
    address constantFees = 0xd40EA2981B350D38281402c058b1Ef1058dbac53;
    address slaveDomainGateway = 0xBD8605d11b8D3557b7399eFE1866992Eed6F9A7c; // TODO @nulven
    L1EscrowLike escrow = L1EscrowLike(0x8FdA2c4323850F974C7Abf4B16eD129D45f9E2e2); // TODO @nulven
    address dai = 0x03e85bfbb8e2a42b7bead9e88e9a1b19dbccf661471061807292120462396ec9; // TODO @nulven

    GovernanceRelayLike l1GovRelay = GovernanceRelayLike(0x73c0049Dd6560E644984Fa3Af30A55a02a7D81fB);
    address l2ConfigureDomainSpell = 0xEd326504C77Dcd0Ffbb554a7925338EEd3F5fE01; // TODO @nulven

    router.file(bytes32("gateway"), slaveDomain, slaveDomainGateway);
    wormholeJoin.file(bytes32("fees"), slaveDomain, constantFees);
    wormholeJoin.file(bytes32("line"), slaveDomain, optimismSlaveLine);
    escrow.approve(dai, slaveDomainGateway, type(uint256).max);
    l1GovRelay.relay(l2ConfigureDomainSpell); // TODO
  }
}

contract L1KovanAddWormholeDomainSpell is DssExec {
  constructor() DssExec(block.timestamp + 30 days, address(new DssSpellAction())) {}
}

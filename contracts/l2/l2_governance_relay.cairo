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

use traits::Into;
use starknet::StorageAccess;
use starknet::StorageAddress;
use starknet::StorageBaseAddress;
use starknet::SyscallResult;

#[abi]
trait ISpell {
    fn execute();
}

// TODO: remove when available in the standard library.
// An Ethereum address (160 bits) .
#[derive(Serde, Copy, Drop)]
struct EthAddress {
    address: felt252,
}

trait EthAddressTrait {
    fn new(address: felt252) -> EthAddress;
}

impl EthAddressImpl of EthAddressTrait {
    fn new(address: felt252) -> EthAddress {
        let ETH_ADDRESS_BOUND = u256 { high: 0x100000000_u128, low: 0_u128 }; // 2 ** 160

        assert(address.into() < ETH_ADDRESS_BOUND, 'INVALID_ETHEREUM_ADDRESS');
        EthAddress { address }
    }
}
impl EthAddressIntoFelt252 of Into<EthAddress, felt252> {
    fn into(address: EthAddress) -> felt252 {
        address.address
    }
}

impl EthAddressStorageAccess of StorageAccess::<EthAddress> {
    fn read(address_domain: u32, base: StorageBaseAddress) -> SyscallResult<EthAddress> {
        Result::Ok(
            EthAddressTrait::new(StorageAccess::<felt252>::read(address_domain, base)?)
        )
    }
    fn write(address_domain: u32, base: StorageBaseAddress, value: EthAddress) -> SyscallResult<()> {
        StorageAccess::<felt252>::write(address_domain, base, value.into())
    }
}

#[contract]
mod L2GovernanceDelay {
    use starknet::get_caller_address;
    use starknet::get_contract_address;
    use starknet::ClassHash;
    use super::ISpellDispatcherTrait;
    use super::ISpellDispatcher;
    use super::ISpellLibraryDispatcher;
    use traits::Into;
    use integer::U128IntoFelt252;
    use super::EthAddress;
    use super::EthAddressIntoFelt252;
    use super::EthAddressTrait;

    struct Storage {
        _l1_governance_relay: EthAddress
    }

    #[view]
    fn l1_governance_relay() -> EthAddress {
        _l1_governance_relay::read()
    }

    #[constructor]
    fn constructor(l1_governance_relay: EthAddress) {
        _l1_governance_relay::write(l1_governance_relay);
    }

    #[l1_handler]
    fn relay(from_address: felt252, spell: ClassHash) {
        let l1_governance_relay = _l1_governance_relay::read();
        assert(_l1_governance_relay::read().into() == from_address, 'l2_gov_relay/not-from-l1_relay');

        ISpellLibraryDispatcher { class_hash: spell }.execute();
    }
}

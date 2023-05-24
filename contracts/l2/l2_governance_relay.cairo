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

use traits::{Into,TryInto};
use option::{Option, OptionTrait};
use starknet::StorageAccess;
use starknet::StorageAddress;
use starknet::StorageBaseAddress;
use starknet::SyscallResult;
use starknet::EthAddress;
use starknet::EthAddressIntoFelt252;
use starknet::Felt252TryIntoEthAddress;

#[abi]
trait ISpell {
    fn execute();
}

impl EthAddressStorageAccess of StorageAccess::<EthAddress> {
    fn read(address_domain: u32, base: StorageBaseAddress) -> SyscallResult<EthAddress> {
        Result::Ok(
            EthAddress { address: StorageAccess::<felt252>::read(address_domain, base)?}
        )
    }
    fn write(address_domain: u32, base: StorageBaseAddress, value: EthAddress) -> SyscallResult<()> {
        StorageAccess::<felt252>::write(address_domain, base, value.into())
    }
    fn read_at_offset_internal(
        address_domain: u32, base: StorageBaseAddress, offset: u8
    ) -> SyscallResult<EthAddress> {
        Result::Ok(
            StorageAccess::<felt252>::read_at_offset_internal(address_domain, base, offset)?
                .try_into()
                .expect('Non EthAddress')
        )
    }
    fn write_at_offset_internal(
        address_domain: u32, base: StorageBaseAddress, offset: u8, value: EthAddress
    ) -> SyscallResult<()> {
        StorageAccess::<felt252>::write_at_offset_internal(
            address_domain, base, offset, value.into()
        )
    }
    #[inline(always)]
    fn size_internal(value: EthAddress) -> u8 {
        1_u8
    }
}

#[contract]
mod L2GovernanceRelay {
    use starknet::ClassHash;
    use super::ISpellDispatcherTrait;
    use super::ISpellLibraryDispatcher;
    use traits::Into;
    use starknet::EthAddress;
    use super::EthAddressStorageAccess;

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
        assert(_l1_governance_relay::read().into() == from_address, 'l2_gov_relay/not-from-l1_relay');

        ISpellLibraryDispatcher { class_hash: spell }.execute();
    }
}

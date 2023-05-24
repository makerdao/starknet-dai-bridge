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

use serde::Serde;
use traits::{Into, TryInto};
use option::{Option, OptionTrait};
use zeroable::Zeroable;
use starknet::ContractAddress;
use starknet::StorageAccess;
use starknet::StorageAddress;
use starknet::StorageBaseAddress;
use starknet::SyscallResult;
use starknet::EthAddress;
use starknet::EthAddressIntoFelt252;
use starknet::Felt252TryIntoEthAddress;

#[abi]
trait IBurnable {
    fn burn(from_address: ContractAddress, value: u256);
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

impl U128IntoU256 of Into<u128, u256> {
    fn into(self: u128) -> u256 {
        u256 { low: self, high: 0_u128 }
    }
}

#[contract]
mod L2DAITeleportGateway {
    use starknet::get_caller_address;
    use starknet::syscalls::send_message_to_l1_syscall;
    use starknet::info::get_block_timestamp;
    use starknet::ContractAddress;
    use traits::Into;
    use zeroable::Zeroable;
    use integer::U128IntoFelt252;
    use starknet::EthAddress;
    use starknet::EthAddressIntoFelt252;
    use starknet::EthAddressSerde;
    use starknet::EthAddressZeroable;
    use starknet::StorageAddress;
    use starknet::StorageBaseAddress;
    use super::EthAddressStorageAccess;
    use super::IBurnableDispatcher;
    use super::IBurnableDispatcherTrait;
    use array::ArrayTrait;
    use super::U128IntoU256;

    const FINALIZE_REGISTER_TELEPORT: felt252 = 0;
    const FINALIZE_FLUSH: felt252 = 1;
    const MAX_NONCE: u128 = 1208925819614629174706175_u128; //2**80-1

    //#[derive(Drop, Serde, PartialEq, Copy, storage_access::StorageAccess)]
    #[derive(Drop, Serde, PartialEq, storage_access::StorageAccess)]
    struct TeleportData {
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        timestamp: u64
    }

    struct Storage {
        _nonce: u128,
        _is_open: bool,
        _dai: IBurnableDispatcher,
        _teleport_gateway: EthAddress,
        _domain: felt252,
        _valid_domains: LegacyMap<felt252, bool>,
        _batched_dai_to_flush: LegacyMap<felt252, u256>,
        _wards: LegacyMap<ContractAddress, bool>,
        _teleports: LegacyMap<u128, TeleportData>,
    }

    #[event]
    fn Closed() {}

    #[event]
    fn Rely(user: ContractAddress) {}

    #[event]
    fn Deny(user: ContractAddress) {}

    #[event]
    fn File(what: felt252, domain: felt252, data: bool) {}

    #[event]
    fn TeleportInitialized(
        source_domain: felt252,
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        nonce: u128,
        timestamp: u64,
    ) {}

    #[event]
    fn TeleportRegisterFinalized(
        source_domain: felt252,
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        nonce: u128,
        timestamp: u64,
    ) {}

    #[event]
    fn Flushed(target_domain: felt252, dai: u256) {}

    #[view]
    fn nonce() -> u128 {
        _nonce::read()
    }

    #[view]
    fn is_open() -> bool {
        _is_open::read()
    }

    #[view]
    fn dai() -> ContractAddress {
        _dai::read().contract_address
    }

    #[view]
    fn teleport_gateway() -> EthAddress {
        _teleport_gateway::read()
    }

    #[view]
    fn domain() -> felt252 {
        _domain::read()
    }

    #[view]
    fn valid_domains(domain: felt252) -> bool {
        _valid_domains::read(domain)
    }

    #[view]
    fn batched_dai_to_flush(domain: felt252) -> u256 {
        _batched_dai_to_flush::read(domain)
    }

    #[view]
    fn wards(user: ContractAddress) -> bool {
        _wards::read(user)
    }

    #[view]
    fn teleports(nonce: u128) -> TeleportData {
        _teleports::read(nonce)
    }

    #[external]
    fn rely(user: ContractAddress) {
        auth();
        _wards::write(user, true);
        Rely(user);
    }

    #[external]
    fn deny(user: ContractAddress) {
        auth();
        _wards::write(user, false);
        Deny(user);
    }

    fn auth() {
        assert(_wards::read(get_caller_address()), 'l2_dai_teleport/not-authorized');
    }

    fn read_and_update_nonce() -> u128 {
        let nonce = _nonce::read();
        assert(nonce < MAX_NONCE, 'l2_dai_teleport/nonce-overflow');
        _nonce::write(nonce + 1);
        nonce
    }

    #[constructor]
    fn constructor(
        ward: ContractAddress,
        dai: ContractAddress,
        teleport_gateway: EthAddress,
        domain: felt252,
    ) {
        _wards::write(ward, true);
        Rely(ward);

        _is_open::write(true);
        _dai::write(IBurnableDispatcher { contract_address: dai });
        _teleport_gateway::write(teleport_gateway);
        _domain::write(domain);
    }

    #[external]
    fn close() {
        auth();
        _is_open::write(false);
        Closed();
    }

    #[external]
    fn file(what: felt252, domain: felt252, data: bool) {
        auth();
        assert(what == 'valid_domains', 'l2_dai_teleport/invalid-param');
        _valid_domains::write(domain, data);
        File(what, domain, data);
    }

    #[external]
    fn initiate_teleport(
        target_domain: felt252,
        receiver: EthAddress,
        amount: u128,
        operator: EthAddress,
    ) {
        assert(_is_open::read(), 'l2_dai_teleport/gateway-closed');
        assert(_valid_domains::read(target_domain), 'l2_dai_teleport/invalid-domain');
        assert(amount.is_non_zero(), 'l2_dai_teleport/invalid-amount');

        _batched_dai_to_flush::write(
            target_domain,
            _batched_dai_to_flush::read(target_domain) + amount.into()
        );

        _dai::read().burn(get_caller_address(), amount.into());

        let domain = _domain::read();
        let nonce = read_and_update_nonce();
        let timestamp = get_block_timestamp();

        TeleportInitialized(
            domain,
            target_domain,
            receiver,
            operator,
            amount,
            nonce,
            timestamp,
        );

        _teleports::write(nonce, TeleportData {
            target_domain,
            receiver,
            operator,
            amount,
            timestamp,
        });
    }

    #[external]
    fn finalize_register_teleport(
        target_domain: felt252,
        receiver: EthAddress,
        amount: u128,
        operator: EthAddress,
        nonce: u128,
        timestamp: u64,
    ) {
        assert(
            TeleportData {
                target_domain,
                receiver,
                operator,
                amount,
                timestamp,
            } == _teleports::read(nonce),
            'l2_dai_teleport/does-not-exist'
        );

        let domain = _domain::read();

        let mut payload: Array<felt252> = ArrayTrait::new();
        payload.append(FINALIZE_REGISTER_TELEPORT);
        payload.append(domain);
        payload.append(target_domain);
        payload.append(receiver.into());
        payload.append(operator.into());
        payload.append(amount.into());
        payload.append(nonce.into());
        payload.append(timestamp.into());

        TeleportRegisterFinalized(
            domain,
            target_domain,
            receiver,
            operator,
            amount,
            nonce,
            timestamp,
        );

        send_message_to_l1_syscall(_teleport_gateway::read().into(), payload.span());
    }

    #[external]
    fn flush(target_domain: felt252) {
        let dai_to_flush = _batched_dai_to_flush::read(target_domain);
        assert(dai_to_flush.is_non_zero(), 'l2_dai_teleport/no-dai-to-flush');

        _batched_dai_to_flush::write(target_domain, Zeroable::zero());

        let mut payload: Array<felt252> = ArrayTrait::new();
        payload.append(FINALIZE_FLUSH);
        payload.append(target_domain);
        payload.append(dai_to_flush.low.into());
        payload.append(dai_to_flush.high.into());

        send_message_to_l1_syscall(_teleport_gateway::read().into(), payload.span());

        Flushed(target_domain, dai_to_flush);
    }
}
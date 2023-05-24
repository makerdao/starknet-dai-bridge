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
use traits::{Into,TryInto};
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
trait IDAI {
    fn mint(to_address: ContractAddress, value: u256);
    fn burn(from_address: ContractAddress, value: u256);
    fn allowance(owner: ContractAddress, spender: ContractAddress) -> u256;
    fn balanceOf(user: ContractAddress) -> u256;
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
mod L2DAIBridge {
    use starknet::get_caller_address;
    use starknet::syscalls::send_message_to_l1_syscall;
    use starknet::ContractAddress;
    use traits::Into;
    use zeroable::Zeroable;
    use integer::U128IntoFelt252;
    use starknet::EthAddress;
    use starknet::EthAddressIntoFelt252;
    use starknet::EthAddressSerde;
    use starknet::EthAddressZeroable;
    use super::EthAddressStorageAccess;
    use super::IDAIDispatcher;
    use super::IDAIDispatcherTrait;
    use array::ArrayTrait;

    const FINALIZE_WITHDRAW: felt252 = 0;

    struct Storage {
        _is_open: bool,
        _dai: IDAIDispatcher,
        _bridge: EthAddress,
        _wards: LegacyMap<ContractAddress, bool>,
    }

    #[event]
    fn Rely(user: ContractAddress) {}

    #[event]
    fn Deny(user: ContractAddress) {}

    #[event]
    fn Closed() {}

    //TODO: conventions for event names changed, align with StarkGate
    #[event]
    fn WithdrawInitiated(l1_recipient: EthAddress, amount: u256, caller: ContractAddress) {}

    //TODO: conventions for event names changed, align with StarkGate
    #[event]
    fn DepositHandled(account: ContractAddress, amount: u256) {}

    #[view]
    fn is_open() -> bool {
        _is_open::read()
    }

    #[view]
    fn dai() -> ContractAddress {
        _dai::read().contract_address
    }

    #[view]
    fn bridge() -> EthAddress {
        _bridge::read()
    }

    #[view]
    fn wards(user: ContractAddress) -> bool {
        _wards::read(user)
    }

    fn auth() {
        assert(_wards::read(get_caller_address()), 'l2_dai_bridge/not-authorized');
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

    #[external]
    fn close() {
        auth();
        _is_open::write(false);
        Closed();
    }

    #[constructor]
    fn constructor(ward: ContractAddress, dai: ContractAddress, bridge: EthAddress) {
        _wards::write(ward, true);
        Rely(ward);
        _is_open::write(true);
        _dai::write(IDAIDispatcher { contract_address: dai });
        _bridge::write(bridge);
    }

    #[external]
    fn initiate_withdraw(l1_recipient: EthAddress, amount: u256) {
        assert(_is_open::read(), 'l2_dai_bridge/bridge-closed');

        let caller = get_caller_address();

        _dai::read().burn(caller, amount);

        let mut payload: Array<felt252> = ArrayTrait::new();
        payload.append(FINALIZE_WITHDRAW);
        payload.append(l1_recipient.into());
        payload.append(amount.low.into());
        payload.append(amount.high.into());

        send_message_to_l1_syscall(_bridge::read().into(), payload.span());

        WithdrawInitiated(l1_recipient, amount, caller);
    }

    #[l1_handler]
    fn handle_deposit(from_address: felt252, l2_recipient: ContractAddress, amount: u256, sender: EthAddress) {

        // l1 msg.sender is ignored

        assert(from_address == _bridge::read().into(), 'l2_dai_bridge/not-from-bridge');

        _dai::read().mint(l2_recipient, amount);

        DepositHandled(l2_recipient, amount);
    }
}

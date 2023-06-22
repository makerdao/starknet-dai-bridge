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

#[starknet::interface]
trait IDai<C> {
    fn mint(ref self: C, recipient: ContractAddress, amount: u256);
    fn burn(ref self: C, account: ContractAddress, amount: u256);
    fn balance_of(self: @C, account: ContractAddress) -> u256;
    fn allowance(self: @C, owner: ContractAddress, spender: ContractAddress) -> u256;
}

#[starknet::contract]
mod L2DAIBridge {
    use starknet::get_caller_address;
    use starknet::syscalls::send_message_to_l1_syscall;
    use starknet::ContractAddress;
    use traits::Into;
    use zeroable::Zeroable;
    use integer::U128IntoFelt252;
    use starknet::EthAddress;
    use super::IDaiDispatcher;
    use super::IDaiDispatcherTrait;
    use array::ArrayTrait;

    const FINALIZE_WITHDRAW: felt252 = 0;

    #[storage]
    struct Storage {
        _is_open: bool,
        _dai: IDaiDispatcher,
        _bridge: EthAddress,
        _wards: LegacyMap<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Rely: Rely,
        Deny: Deny,
        Closed: Closed,
        WithdrawInitiated: WithdrawInitiated,
        DepositHandled: DepositHandled,
    }

    #[derive(Drop, starknet::Event)]
    struct Rely {
        user: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct Deny {
        user: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct Closed {}

    //TODO: conventions for event names changed, align with StarkGate
    #[derive(Drop, starknet::Event)]
    struct WithdrawInitiated {
        l1_recipient: EthAddress,
        amount: u256,
        caller: ContractAddress
    }

    //TODO: conventions for event names changed, align with StarkGate
    #[derive(Drop, starknet::Event)]
    struct DepositHandled {
        account: ContractAddress, amount: u256
    }


    #[constructor]
    fn constructor(
        ref self: ContractState, ward: ContractAddress, dai: ContractAddress, bridge: EthAddress
    ) {
        self._wards.write(ward, true);
        self.emit(Event::Rely(Rely { user: ward }));
        self._is_open.write(true);
        self._dai.write(IDaiDispatcher { contract_address: dai });
        self._bridge.write(bridge);
    }


    #[generate_trait]
    #[external(v0)]
    impl L2DAIBridgeImpl of IL2DAIBridge {
        fn is_open(self: @ContractState) -> bool {
            self._is_open.read()
        }

        fn get_dai(self: @ContractState) -> ContractAddress {
            self._dai.read().contract_address
        }

        fn get_bridge(self: @ContractState) -> EthAddress {
            self._bridge.read()
        }

        fn wards(self: @ContractState, user: ContractAddress) -> bool {
            self._wards.read(user)
        }

        fn rely(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, true);
            self.emit(Event::Rely(Rely { user }));
        }

        fn deny(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, false);
            self.emit(Event::Deny(Deny { user }));
        }

        fn close(ref self: ContractState, ) {
            self.auth();
            self._is_open.write(false);
            self.emit(Event::Closed(Closed {}));
        }

        fn initiate_withdraw(ref self: ContractState, l1_recipient: EthAddress, amount: u256) {
            assert(self._is_open.read(), 'l2_dai_bridge/bridge-closed');

            let caller = get_caller_address();

            self._dai.read().burn(caller, amount);

            let mut payload: Array<felt252> = ArrayTrait::new();
            payload.append(FINALIZE_WITHDRAW);
            payload.append(l1_recipient.into());
            payload.append(amount.low.into());
            payload.append(amount.high.into());

            send_message_to_l1_syscall(self._bridge.read().into(), payload.span());

            self.emit(Event::WithdrawInitiated(WithdrawInitiated{l1_recipient, amount, caller}));
        }
    }

    #[l1_handler]
    fn handle_deposit(
        ref self: ContractState, from_address: felt252, l2_recipient: ContractAddress, amount: u256, sender: EthAddress
    ) {
        // l1 msg.sender is ignored
        assert(from_address == self._bridge.read().into(), 'l2_dai_bridge/not-from-bridge');
        self._dai.read().mint(l2_recipient, amount);
        self.emit(Event::DepositHandled(DepositHandled { account: l2_recipient, amount }));
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        fn auth(self: @ContractState) {
            assert(self._wards.read(get_caller_address()), 'l2_dai_bridge/not-authorized');
        }
    }
}

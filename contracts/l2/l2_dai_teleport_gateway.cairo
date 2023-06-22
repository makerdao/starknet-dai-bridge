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

use starknet::ContractAddress;

#[starknet::interface]
trait IBurnable<C> {
    fn burn(ref self: C, from_address: ContractAddress, value: u256);
}

#[starknet::contract]
mod L2DAITeleportGateway {
    use starknet::get_caller_address;
    use starknet::syscalls::send_message_to_l1_syscall;
    use starknet::info::get_block_timestamp;
    use starknet::ContractAddress;
    use traits::Into;
    use zeroable::Zeroable;
    use starknet::EthAddress;
    use super::IBurnableDispatcher;
    use super::IBurnableDispatcherTrait;
    use array::ArrayTrait;

    const FINALIZE_REGISTER_TELEPORT: felt252 = 0;
    const FINALIZE_FLUSH: felt252 = 1;
    const MAX_NONCE: u128 = 0xffffffffffffffffffff_u128; //2**80-1

    #[derive(Drop, Serde, PartialEq, storage_access::StorageAccess)]
    struct TeleportData {
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        timestamp: u64
    }

    #[storage]
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
    #[derive(Drop, starknet::Event)]
    enum Event {
        Closed: Closed,
        Rely: Rely,
        Deny: Deny,
        File: File,
        TeleportInitialized: TeleportInitialized,
        TeleportRegisterFinalized: TeleportRegisterFinalized,
        Flushed: Flushed,
    }

    #[derive(Drop, starknet::Event)]
    struct Closed {}

    #[derive(Drop, starknet::Event)]
    struct Rely { user: ContractAddress }

    #[derive(Drop, starknet::Event)]
    struct Deny { user: ContractAddress }

    #[derive(Drop, starknet::Event)]
    struct File { what: felt252, domain: felt252, data: bool }

    #[derive(Drop, starknet::Event)]
    struct TeleportInitialized {
        source_domain: felt252,
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        nonce: u128,
        timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct TeleportRegisterFinalized {
        source_domain: felt252,
        target_domain: felt252,
        receiver: EthAddress,
        operator: EthAddress,
        amount: u128,
        nonce: u128,
        timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Flushed {
        target_domain: felt252, dai: u256
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        ward: ContractAddress,
        dai: ContractAddress,
        teleport_gateway: EthAddress,
        domain: felt252,
    ) {
        self._wards.write(ward, true);
        self.emit(Event::Rely(Rely { user: ward }));

        self._is_open.write(true);
        self._dai.write(IBurnableDispatcher { contract_address: dai });
        self._teleport_gateway.write(teleport_gateway);
        self._domain.write(domain);
    }


    #[generate_trait]
    impl L2DAIBridgeImpl of L2DAIBridgeTrait {
        fn nonce(self: @ContractState) -> u128 {
            self._nonce.read()
        }

        fn is_open(self: @ContractState) -> bool {
            self._is_open.read()
        }

        fn dai(self: @ContractState) -> ContractAddress {
            self._dai.read().contract_address
        }

        fn teleport_gateway(self: @ContractState) -> EthAddress {
            self._teleport_gateway.read()
        }

        fn domain(self: @ContractState) -> felt252 {
            self._domain.read()
        }

        fn valid_domains(self: @ContractState, domain: felt252) -> bool {
            self._valid_domains.read(domain)
        }

        fn batched_dai_to_flush(self: @ContractState, domain: felt252) -> u256 {
            self._batched_dai_to_flush.read(domain)
        }

        fn wards(self: @ContractState, user: ContractAddress) -> bool {
            self._wards.read(user)
        }

        fn teleports(self: @ContractState, nonce: u128) -> TeleportData {
            self._teleports.read(nonce)
        }

        fn rely(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, true);
            self.emit(Event::Rely(Rely{user}));
        }

        fn deny(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, false);
            self.emit(Event::Deny(Deny { user }));
        }

        fn auth(self: @ContractState, ) {
            assert(self._wards.read(get_caller_address()), 'l2_dai_teleport/not-authorized');
        }

        fn read_and_update_nonce(ref self: ContractState) -> u128 {
            let nonce = self._nonce.read();
            assert(nonce < MAX_NONCE, 'l2_dai_teleport/nonce-overflow');
            self._nonce.write(1_u128);
            nonce
        }

        fn close(ref self: ContractState) {
            self.auth();
            self._is_open.write(false);
            self.emit(Event::Closed( Closed{} ));
        }

        fn file(ref self: ContractState, what: felt252, domain: felt252, data: bool) {
            self.auth();
            assert(what == 'valid_domains', 'l2_dai_teleport/invalid-param');
            self._valid_domains.write(domain, data);
            self.emit(Event::File(File { what, domain, data }));
        }

        fn initiate_teleport(
            ref self: ContractState,
            target_domain: felt252,
            receiver: EthAddress,
            amount: u128,
            operator: EthAddress,
        ) {
            assert(self._is_open.read(), 'l2_dai_teleport/gateway-closed');
            assert(self._valid_domains.read(target_domain), 'l2_dai_teleport/invalid-domain');
            assert(amount.is_non_zero(), 'l2_dai_teleport/invalid-amount');

            self._batched_dai_to_flush.write(
                target_domain,
                self._batched_dai_to_flush.read(target_domain) + amount.into()
            );

            self._dai.read().burn(get_caller_address(), amount.into());

            let source_domain = self._domain.read();
            let nonce = self.read_and_update_nonce();
            let timestamp = get_block_timestamp();

            self.emit(Event::TeleportInitialized( TeleportInitialized {
                source_domain,
                target_domain,
                receiver,
                operator,
                amount,
                nonce,
                timestamp,
            }));

            self._teleports.write(nonce, TeleportData {
                target_domain,
                receiver,
                operator,
                amount,
                timestamp,
            });
        }


        fn finalize_register_teleport(
            ref self: ContractState,
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
                } == self._teleports.read(nonce),
                'l2_dai_teleport/does-not-exist'
            );

            let source_domain = self._domain.read();

            let mut payload: Array<felt252> = ArrayTrait::new();
            payload.append(FINALIZE_REGISTER_TELEPORT);
            payload.append(source_domain);
            payload.append(target_domain);
            payload.append(receiver.into());
            payload.append(operator.into());
            payload.append(amount.into());
            payload.append(nonce.into());
            payload.append(timestamp.into());

            self.emit(Event::TeleportRegisterFinalized( TeleportRegisterFinalized {
                source_domain,
                target_domain,
                receiver,
                operator,
                amount,
                nonce,
                timestamp,
            }));

            send_message_to_l1_syscall(
                self._teleport_gateway.read().into(),
                payload.span()
            );
        }


        fn flush(ref self: ContractState, target_domain: felt252) {
            let dai_to_flush = self._batched_dai_to_flush.read(target_domain);
            assert(dai_to_flush.is_non_zero(), 'l2_dai_teleport/no-dai-to-flush');

            self._batched_dai_to_flush.write(target_domain, Zeroable::zero());

            let mut payload: Array<felt252> = ArrayTrait::new();
            payload.append(FINALIZE_FLUSH);
            payload.append(target_domain);
            payload.append(dai_to_flush.low.into());
            payload.append(dai_to_flush.high.into());

            send_message_to_l1_syscall(self._teleport_gateway.read().into(), payload.span());

            self.emit(Event::Flushed(Flushed { target_domain, dai: dai_to_flush }));
        }
    }
}
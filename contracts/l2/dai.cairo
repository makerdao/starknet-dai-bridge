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
trait IDai<C> {
    fn wards(self: @C, user: ContractAddress) -> bool;
    fn rely(ref self: C, user: ContractAddress);
    fn deny(ref self: C, user: ContractAddress);
    fn mint(ref self: C, recipient: ContractAddress, amount: u256);
    fn burn(ref self: C, account: ContractAddress, amount: u256);
    fn name(self: @C) -> felt252;
    fn symbol(self: @C) -> felt252;
    fn decimals(self: @C) -> u8;
    fn total_supply(self: @C) -> u256;
    fn balance_of(self: @C, account: ContractAddress) -> u256;
    fn allowance(self: @C, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: C, recipient: ContractAddress, amount: u256);
    fn transfer_from(
        ref self: C, sender: ContractAddress, recipient: ContractAddress, amount: u256
    );
    fn approve(ref self: C, spender: ContractAddress, amount: u256);
    fn increase_allowance(ref self: C, spender: ContractAddress, added_value: u256);
    fn decrease_allowance(
        ref self: C, spender: ContractAddress, subtracted_value: u256
    );
}

#[starknet::contract]
mod Dai {
    use starknet::get_caller_address;
    use starknet::get_contract_address;
    use starknet::ContractAddress;
    use zeroable::Zeroable;
    use integer::BoundedInt;

    #[storage]
    struct Storage {
        _total_supply: u256,
        _balances: LegacyMap<ContractAddress, u256>,
        _allowances: LegacyMap<(ContractAddress, ContractAddress), u256>,
        _wards: LegacyMap<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Rely: Rely,
        Deny: Deny,
        Transfer: Transfer,
        Approval: Approval,
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
    struct Transfer {
        from: ContractAddress,
        to: ContractAddress,
        value: u256
    }

    #[derive(Drop, starknet::Event)]
    struct Approval {
        owner: ContractAddress,
        spender: ContractAddress,
        value: u256
    }

    #[constructor]
    fn constructor(ref self: ContractState, ward: ContractAddress) {
        self._wards.write(ward, true);
        self.emit(Event::Rely(Rely { user: ward }));
    }

    #[external(v0)]
    impl IDaiImpl of super::IDai<ContractState> {
        fn name(self: @ContractState) -> felt252 {
            'Dai Stablecoin'
        }

        fn symbol(self: @ContractState) -> felt252 {
            'DAI'
        }

        fn decimals(self: @ContractState) -> u8 {
            18_u8
        }

        fn total_supply(self: @ContractState) -> u256 {
            self._total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self._balances.read(account)
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self._allowances.read((owner, spender))
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> () {
            self.transfer_helper(get_caller_address(), recipient, amount);
        }

        fn transfer_from(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) -> () {

            self.transfer_helper(sender, recipient, amount);

            let caller = get_caller_address();
            if(caller != sender) {
                let allowance = self._allowances.read((sender, caller));
                if(allowance != BoundedInt::max()) {
                    assert(allowance >= amount, 'dai/insufficient-allowance');
                    self._allowances.write((sender, caller), allowance - amount);
                }
            }
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> () {
            self.approve_helper(get_caller_address(), spender, amount);
        }

        fn increase_allowance(ref self: ContractState, spender: ContractAddress, added_value: u256) -> () {
            let caller = get_caller_address();
            self.approve_helper(caller, spender, self._allowances.read((caller, spender)) + added_value);
        }

        fn decrease_allowance(ref self: ContractState, spender: ContractAddress, subtracted_value: u256) -> () {
            let caller = get_caller_address();
            self.approve_helper(caller, spender, self._allowances.read((caller, spender)) - subtracted_value);
        }

        fn wards(self: @ContractState, user: ContractAddress) -> bool {
            self._wards.read(user)
        }

        fn rely(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, true);
            self.emit(Event::Rely( Rely { user }));
        }

        fn deny(ref self: ContractState, user: ContractAddress) {
            self.auth();
            self._wards.write(user, false);
            self.emit(Event::Deny(Deny { user }));
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.auth();

            assert(recipient.is_non_zero(), 'dai/invalid-recipient');
            assert(recipient != get_contract_address(), 'dai/invalid-recipient');

            self._balances.write(recipient, self._balances.read(recipient) + amount);
            // TODO: no need for safe math here
            self._total_supply.write(self._total_supply.read() + amount);

            self.emit(Event::Transfer(
                Transfer { from: Zeroable::zero(), to: recipient, value: amount }
            ));
        }

        fn burn(ref self: ContractState, account: ContractAddress, amount: u256) {

            let balance = self._balances.read(account);
            assert(balance >= amount, 'dai/insufficient-balance');

            self._balances.write(account, balance - amount);

            self._total_supply.write(self._total_supply.read() - amount);

            self.emit(Event::Transfer(
                Transfer { from: account, to: Zeroable::zero(), value: amount }
            ));

            let caller = get_caller_address();

            if(caller != account) {
                let allowance = self._allowances.read((account, caller));
                if(allowance != BoundedInt::max()) {
                    assert(allowance >= amount, 'dai/insufficient-allowance');
                    self._allowances.write((account, caller), allowance - amount);
                }
            }
        }
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {

        fn auth(self: @ContractState) {
            assert(self._wards.read(get_caller_address()), 'dai/not-authorized');
        }

        fn transfer_helper(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) {

            assert(recipient.is_non_zero(), 'dai/invalid-recipient');
            assert(recipient != get_contract_address(), 'dai/invalid-recipient');

            let sender_balance = self._balances.read(sender);
            assert(sender_balance >= amount, 'dai/insufficient-balance');

            self._balances.write(sender, sender_balance - amount);
            self._balances.write(recipient, self._balances.read(recipient) + amount);

            self.emit(Event::Transfer(Transfer { from: sender, to: recipient, value: amount}));
        }

        fn approve_helper(ref self: ContractState, caller: ContractAddress, spender: ContractAddress, amount: u256) {
            assert(spender.is_non_zero(), 'dai/invalid-recipient');
            self._allowances.write((caller, spender), amount);
            self.emit(Event::Approval( Approval {owner: caller, spender, value: amount}));
        }
    }
}

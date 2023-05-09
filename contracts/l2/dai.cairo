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

#[contract]
mod Dai {
    use starknet::get_caller_address;
    use starknet::get_contract_address;
    use starknet::ContractAddress;
    use starknet::ContractAddressZeroable;
    use zeroable::Zeroable;
    use integer::BoundedInt;

    struct Storage {
        _name: felt252,               // TODO: change to char type when available
        _symbol: felt252,             // TODO: change to char type when available
        _total_supply: u256,
        _balances: LegacyMap<ContractAddress, u256>,
        _allowances: LegacyMap<(ContractAddress, ContractAddress), u256>,
        _wards: LegacyMap<ContractAddress, bool>,
    }

    #[event]
    fn Rely(user: ContractAddress) {}

    #[event]
    fn Deny(user: ContractAddress) {}

    #[event]
    fn Transfer(sender: ContractAddress, recipient: ContractAddress, value: u256) {}

    #[event]
    fn Approval(owner: ContractAddress, spender: ContractAddress, value: u256) {}

    #[view]
    fn decimals() -> u8 {
        18_u8
    }

    #[view]
    fn name() -> felt252 {
        _name::read()
    }

    #[view]
    fn symbol() -> felt252 {
        _symbol::read()
    }

    #[view]
    fn totalSupply() -> u256 {
        _total_supply::read()
    }

    #[view]
    fn balanceOf(user: ContractAddress) -> u256 {
        _balances::read(user)
    }

    #[view]
    fn allowance(owner: ContractAddress, spender: ContractAddress) -> u256 {
        _allowances::read((owner, spender))
    }

    #[view]
    fn wards(user: ContractAddress) -> bool {
        _wards::read(user)
    }

    fn auth() {
        assert(_wards::read(get_caller_address()), 'dai/not-authorized');
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

    #[constructor]
    fn constructor(ward: ContractAddress) {
        _wards::write(ward, true);
        Rely(ward);
    }

    #[external]
    fn mint(account: ContractAddress, amount: u256) {
        auth();

        assert(account.is_non_zero(), 'dai/invalid-recipient');
        assert(account != get_contract_address(), 'dai/invalid-recipient');

        _balances::write(account, _balances::read(account) + amount);
        // TODO: no need for safe math here
        _total_supply::write(_total_supply::read() + amount);

        Transfer(Zeroable::zero(), account, amount);
    }

    #[external]
    fn burn(account: ContractAddress, amount: u256) {

        let balance = _balances::read(account);
        assert(balance >= amount, 'dai/insufficient-balance');

        _balances::write(account, balance - amount);

        // TODO: no need for safe math here
        _total_supply::write(_total_supply::read() - amount);

        Transfer(account, Zeroable::zero(), amount);

        let caller = get_caller_address();

        if(caller != account) {
            let allowance = _allowances::read((account, caller));
            if(allowance != BoundedInt::max()) {
                assert(allowance >= amount, 'dai/insufficient-allowance');
                _allowances::write((account, caller), allowance - amount);
            }
        }
    }

    #[external]
    fn transfer(recipient: ContractAddress, amount: u256) -> bool {
        _transfer(get_caller_address(), recipient, amount);
        true
    }

    #[external]
    fn transferFrom(sender: ContractAddress, recipient: ContractAddress, amount: u256) -> bool {

        _transfer(sender, recipient, amount);

        let caller = get_caller_address();
        if(caller != sender) {
            let allowance = _allowances::read((sender, caller));
            if(allowance != BoundedInt::max()) {
                assert(allowance >= amount, 'dai/insufficient-allowance');
                _allowances::write((sender, caller), allowance - amount);
            }
        }
        true
    }

    #[external]
    fn approve(spender: ContractAddress, amount: u256) -> bool {
        _approve(get_caller_address(), spender, amount);
        true
    }

    #[external]
    fn increaseAllowance(spender: ContractAddress, amount: u256) -> bool {
        let caller = get_caller_address();
        _approve(caller, spender, _allowances::read((caller, spender)) + amount);
        true
    }

    #[external]
    fn decreaseAllowance(spender: ContractAddress, amount: u256) -> bool {
        let caller = get_caller_address();
        _approve(caller, spender, _allowances::read((caller, spender)) - amount);
        true
    }

    fn _transfer(sender: ContractAddress, recipient: ContractAddress, amount: u256) {

        assert(recipient.is_non_zero(), 'dai/invalid-recipient');
        assert(recipient != get_contract_address(), 'dai/invalid-recipient');

        let sender_balance = _balances::read(sender);
        assert(sender_balance >= amount, 'dai/insufficient-balance');

        _balances::write(sender, sender_balance - amount);
        _balances::write(recipient, _balances::read(recipient) + amount);

        Transfer(sender, recipient, amount);
    }

    fn _approve(caller: ContractAddress, spender: ContractAddress, amount: u256) {
        assert(spender.is_non_zero(), 'dai/invalid-recipient');
        _allowances::write((caller, spender), amount);
        Approval(caller, spender, amount);
    }

}

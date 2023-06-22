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

#[starknet::interface]
trait ISpell<TContractState> {
    fn execute(self: @TContractState);
}

#[starknet::contract]
mod L2GovernanceRelay {
    use starknet::ClassHash;
    use super::ISpellDispatcherTrait;
    use super::ISpellLibraryDispatcher;
    use traits::Into;
    use starknet::EthAddress;

    #[storage]
    struct Storage {
        l1_governance_relay: EthAddress
    }

    #[constructor]
    fn constructor(ref self: ContractState, l1_governance_relay: EthAddress) {
        self.l1_governance_relay.write(l1_governance_relay);
    }

    #[generate_trait]
    #[external(v0)]
    impl L2GovernanceRelay of IL2GovernanceRelay {
        fn get_l1_governance_relay(self: @ContractState) -> EthAddress {
            self.l1_governance_relay.read()
        }
    }

    #[l1_handler]
    fn relay(ref self: ContractState, from_address: felt252, spell: ClassHash) {
        assert(self.l1_governance_relay.read().into() == from_address, 'l2_gov_relay/not-from-l1_relay');
        ISpellLibraryDispatcher { class_hash: spell }.execute();
    }
}

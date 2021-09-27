%lang starknet

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le
from contracts.l2.ERC20 import (totalSupply, balanceOf, transfer, transferFrom,
allowance, approve,
balances, total_supply, allowances, increase_balance, decrease_balance,
increase_supply, decrease_supply)
from starkware.starknet.common.syscalls import get_caller_address

@external
func mint{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        to_address : felt, value : felt):

    increase_balance(to_address, value)

    increase_supply(value)

    return ()
end

@external
func burn{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        from_address : felt, value : felt):

    decrease_balance(from_address, value)
    decrease_supply(value)

    # send to burn address
    increase_balance(0, value)

    return ()
end

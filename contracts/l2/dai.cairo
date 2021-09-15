%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math import assert_nn_le


@storage_var
func balances(address : felt) -> (balance : felt):
end

@storage_var
func total_balance() -> (res : felt):
end

@view
func totalBalance{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}() -> (
        totalBalance : felt):
    let (totalBalance) = total_balance.read()
    return (totalBalance)
end

@view
func balanceOf{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        owner : felt) -> (balanceOf : felt):
    let (balanceOf) = balances.read(owner)
    return (balanceOf)
end

@external
func mint{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        to_address : felt, value : felt):
    let (balance) = balances.read(to_address)
    let (total) = total_balance.read()
    balances.write(to_address, balance + value)
    total_balance.write(total + value)
    return ()
end

@external
func burn{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        from_address : felt, value : felt):
    let (balance) = balances.read(from_address)
    let (total) = total_balance.read()
    assert_nn_le(value, balance)
    balances.write(from_address, balance - value)
    total_balance.write(total - value)
    return ()
end

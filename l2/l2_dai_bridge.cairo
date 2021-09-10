%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin

@storage_var
func dai() -> (res : felt):
end

@external
func setDai{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(_dai : felt):
    assert dai.read() == 0
    dai.write(_dai)
    return ()
end

@external
func withdraw{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
        from_address : felt, to_address : felt, amount : felt):
end

@external
func finalizeDeposit{storage_ptr : Storage*, pedersen_ptr : HashBuiltin*}(
        from_address : felt, to_address : felt, amount : felt):
    return ()
end

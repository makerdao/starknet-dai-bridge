// amarna: disable=must-check-caller-address
%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address

@storage_var
func _l1_addresses(l2_user: felt) -> (l1_user: felt) {
}

@external
func set_L1_address{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    l1_user: felt
) {
    let (caller) = get_caller_address();
    _l1_addresses.write(caller, l1_user);

    return ();
}

@view
func get_L1_address{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    l2_user: felt
) -> (l1_user: felt) {
    let (l1_user) = _l1_addresses.read(l2_user);
    return (l1_user,);
}

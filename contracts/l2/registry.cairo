%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address
from contracts.l2.utils import assert_l1_address

@storage_var
func _l1_addresses(l2_user : felt) -> (l1_user : felt):
end

@external
func set_L1_address{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l1_user : felt):
  assert_l1_address(l1_user)

  let (caller) = get_caller_address()
  _l1_addresses.write(caller, l1_user)

  return ()
end

@view
func get_L1_address{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l2_user : felt) -> (l1_user : felt):
    let (l1_user) = _l1_addresses.read(l2_user)
    return (l1_user)
end

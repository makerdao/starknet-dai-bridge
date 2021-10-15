%lang starknet
%builtins pedersen range_check

from starkware.starknet.common.storage import Storage
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address

@storage_var
func l1_addresses(l2_user : felt) -> (l1_user : felt):
end

@external
func register{
    syscall_ptr : felt*,
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l1_address : felt) -> ():

  let (caller) = get_caller_address()
  l1_addresses.write(caller, l1_address)

  return ()
end

@view
func l1_address{
    storage_ptr : Storage*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(l2_address : felt) -> (l1_address : felt):
    let (l1_address) = l1_addresses.read(l2_address)
    return (l1_address)
end
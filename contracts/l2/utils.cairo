from starkware.cairo.common.uint256 import (Uint256, uint256_le)
from starkware.cairo.common.cairo_builtins import HashBuiltin

const MAX_L1_ADDRESS_LOW = 2**128-1
const MAX_L1_ADDRESS_HIGH = 4294967295


func assert_l1_address{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(address : felt):
    let MAX_L1_ADDRESS = Uint256(
      low=MAX_L1_ADDRESS_LOW,
      high=MAX_L1_ADDRESS_HIGH)

    let (is_le) = uint256_le(address, MAX_L1_ADDRESS)
    assert is_le = 1
end

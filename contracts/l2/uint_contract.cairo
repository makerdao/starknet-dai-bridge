%lang starknet
%builtins range_check bitwise

from starkware.cairo.common.cairo_builtins import BitwiseBuiltin
from contracts.l2.uint import (uint256, add, sub)

@external
func add_ext{
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(a_low : felt, a_high : felt, b_low : felt, b_high : felt) -> (low : felt, high : felt):
    let a = uint256(low=a_low, high=a_high)
    let b = uint256(low=b_low, high=b_high)
    let (res : uint256) = add(a, b)
    return (low=res.low, high=res.high)
end

@external
func sub_ext{
    range_check_ptr,
    bitwise_ptr : BitwiseBuiltin*
  }(a_low : felt, a_high : felt, b_low : felt, b_high : felt) -> (low : felt, high : felt):
    let a = uint256(low=a_low, high=a_high)
    let b = uint256(low=b_low, high=b_high)
    let (res : uint256) = sub(a, b)
    return (low=res.low, high=res.high)
end

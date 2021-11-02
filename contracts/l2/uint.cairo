from starkware.cairo.common.math import assert_le
from starkware.cairo.common.math_cmp import is_le
from starkware.cairo.common.cairo_builtins import BitwiseBuiltin
from starkware.cairo.common.bitwise import (bitwise_and, bitwise_xor)

const MAX_SPLIT = 2**128-1

struct uint256:
  member low : felt
  member high : felt
end

func assert_uint{range_check_ptr} (value : uint256):
  assert_le(value.low, MAX_SPLIT)
  assert_le(value.high, MAX_SPLIT)
  
  return ()
end

func is_eq{range_check_ptr} (a : uint256, b : uint256) -> (res : felt):
  if a.low != b.low:
    return (res=0)
  end

  if a.high != b.high:
    return (res=0)
  end

  return (res=1)
end

func _add{
    range_check_ptr,
    bitwise_ptr: BitwiseBuiltin*
  }(a : felt, b : felt, carry : felt) -> (res : felt, rem : felt):
    alloc_locals

    let a_and_b = a + b
    local sum = a_and_b + carry

    let (in_range) = is_le(sum, MAX_SPLIT)

    if in_range == 1:
      # a + b + carry <= MAX_SPLIT

      tempvar res = sum
      tempvar rem = 0

      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    else:
      # a + b + carry > MAX_SPLIT

      let (res2) = bitwise_and(sum, MAX_SPLIT)
      tempvar res = res2
      tempvar rem = 1

      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    return (res=res, rem=rem)
end

func add{
    range_check_ptr,
    bitwise_ptr: BitwiseBuiltin*
  }(a : uint256, b : uint256) -> (res : uint256):
    alloc_locals

    assert_uint(a)
    assert_uint(b)

    let (local low, carry) = _add(a.low, b.low, 0)
    local range_check_ptr = range_check_ptr
    let (local high, overflow) = _add(a.high, b.high, carry)
    local range_check_ptr = range_check_ptr
    if overflow != 0:
      # throw error
      assert 1 = 0
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    else:
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    let res = uint256(low=low, high=high)
    assert_uint(res)
    return (res)
end

func _sub{
    range_check_ptr,
    bitwise_ptr: BitwiseBuiltin*
  }(a : felt, b : felt, carry : felt) -> (res : felt, rem : felt):
    alloc_locals

    let (in_range) = is_le(b + carry, a)

    if in_range == 1:
      # a - b - carry >= 0
      let a_sub_b = a - b
      local diff = a_sub_b - carry

      tempvar res = diff
      tempvar rem = 0

      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    else:
      # a - b - carry < 0
      let b_sub_a = b - a
      local diff = b_sub_a + carry

      let max = MAX_SPLIT + 1
      tempvar res = max - diff
      tempvar rem = 1

      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    return (res=res, rem=rem)
end

func sub{
    range_check_ptr,
    bitwise_ptr: BitwiseBuiltin*
 } (a : uint256, b : uint256) -> (res : uint256):
    alloc_locals

    assert_uint(a)
    assert_uint(b)

    let (local low, carry) = _sub(a.low, b.low, 0)
    local range_check_ptr = range_check_ptr
    let (local high, overflow) = _sub(a.high, b.high, carry)
    local range_check_ptr = range_check_ptr
    if overflow != 0:
      # throw error
      assert 1 = 0
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    else:
      tempvar range_check_ptr = range_check_ptr
      tempvar bitwise_ptr : BitwiseBuiltin* = bitwise_ptr
    end

    let res = uint256(low=low, high=high)
    assert_uint(res)
    return (res)
end

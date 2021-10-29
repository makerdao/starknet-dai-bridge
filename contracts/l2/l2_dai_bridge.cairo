%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.alloc import alloc
from starkware.starknet.common.messages import send_message_to_l1
from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.math_cmp import is_le
from starkware.starknet.common.syscalls import get_caller_address

const FINALIZE_WITHDRAW = 0

@contract_interface
namespace IDAI:
    func mint(to_address : felt, value : felt):
    end

    func burn(from_address : felt, value : felt):
    end

    func allowance(owner : felt, spender : felt) -> (res : felt):
    end

    func balanceOf(user : felt) -> (res : felt):
    end
end

@contract_interface
namespace IRegistry:
    func l1_address(l2_address : felt) -> (l1_address : felt):
    end
end

@storage_var
func _is_open() -> (res : felt):
end

@storage_var
func _dai() -> (res : felt):
end

@storage_var
func _registry() -> (res : felt):
end

@storage_var
func _bridge() -> (res : felt):
end

@storage_var
func _initialized() -> (res : felt):
end

@storage_var
func _wards(user : felt) -> (res : felt):
end

@storage_var
func _this() -> (res : felt):
end

func auth{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let (caller) = get_caller_address()
    let (ward) = _wards.read(caller)
    assert ward = 1
    return ()
end

@external
func rely{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt):
    auth()
    _wards.write(user, 1)
    return ()
end

@external
func deny{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(user : felt):
    auth()
    _wards.write(user, 0)
    return ()
end

@external
func close{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    _is_open.write(0)
    return ()
end

@external
func initialize{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(dai : felt, bridge : felt, registry : felt, this : felt):
    let (initialized) = _initialized.read()
    assert initialized = 0
    _initialized.write(1)

    let (caller) = get_caller_address()
    _wards.write(caller, 1)

    _is_open.write(1)
    _dai.write(dai)
    _bridge.write(bridge)
    _registry.write(registry)
    _this.write(this)

    return ()
end

@external
func withdraw{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(dest : felt, amount : felt):
    alloc_locals

    let (is_open) = _is_open.read()
    assert is_open = 1

    let (dai) = _dai.read()
    let (caller) = get_caller_address()

    IDAI.burn(dai, caller, amount)

    send_finalize_withdraw(dest, amount)

    return ()
end

# TODO: external is temporary
@external
@l1_handler
func finalize_deposit{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender : felt, dest : felt, amount : felt):
    # check l1 message sender
    let (bridge) = _bridge.read()
    assert sender = bridge

    let (dai) = _dai.read()
    IDAI.mint(dai, dest, amount)

    return ()
end

# TODO: external is temporary
@external
@l1_handler
func finalize_force_withdrawal{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(sender : felt, source : felt, dest : felt, amount : felt):
    alloc_locals

    # check l1 message sender
    let (bridge) = _bridge.read()
    assert sender = bridge

    # check l1 recipent address
    let (registry) = _registry.read()
    let (_dest) = IRegistry.l1_address(registry, source)
    if _dest != dest:
        return ()
    end

    let (local dai) = _dai.read()

    # check l2 DAI balance
    let (balance) = IDAI.balanceOf(dai, source)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    local range_check_ptr = range_check_ptr
    let (balance_check) = is_le(amount, balance)
    if balance_check == 0:
        return ()
    end

    # check allowance
    let (this) = _this.read()
    let (allowance) = IDAI.allowance(dai, source, this)
    local syscall_ptr : felt* = syscall_ptr
    local pedersen_ptr : HashBuiltin* = pedersen_ptr
    local range_check_ptr = range_check_ptr
    let (allowance_check) = is_le(amount, allowance)
    if allowance_check == 0:
        return ()
    end

    IDAI.burn(dai, source, amount)
    send_finalize_withdraw(dest, amount)
    return ()
end

func send_finalize_withdraw{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }(dest : felt, amount : felt):
    alloc_locals

    let (payload : felt*) = alloc()
    assert payload[0] = FINALIZE_WITHDRAW
    assert payload[1] = dest
    assert payload[2] = amount

    let (bridge) = _bridge.read()

    send_message_to_l1(bridge, 3, payload)
    return ()
end

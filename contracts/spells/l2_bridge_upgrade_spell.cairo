%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.starknet.common.syscalls import get_caller_address

@contract_interface
namespace DAI {
    func rely(user: felt) {
    }
}

@contract_interface
namespace Bridge {
    func close() {
    }
}

@storage_var
func _dai() -> (res: felt) {
}

@storage_var
func _new_bridge() -> (res: felt) {
}

@storage_var
func _old_bridge() -> (res: felt) {
}

@view
func dai{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _dai.read();
    return (res,);
}

@view
func new_bridge{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _new_bridge.read();
    return (res,);
}

@view
func old_bridge{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (res) = _old_bridge.read();
    return (res,);
}

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    dai: felt, new_bridge: felt, old_bridge: felt
) {
    _dai.write(dai);
    _new_bridge.write(new_bridge);
    _old_bridge.write(old_bridge);

    return ();
}

@external
func execute{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    let (dai) = _dai.read();
    let (new_bridge) = _new_bridge.read();
    let (old_bridge) = _old_bridge.read();

    DAI.rely(dai, new_bridge);
    Bridge.close(old_bridge);

    return ();
}

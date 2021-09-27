%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.hash import hash2
from starkware.cairo.common.registers import get_fp_and_pc
from starkware.cairo.common.cairo_builtins import HashBuiltin, SignatureBuiltin
from starkware.starknet.common.syscalls import call_contract
from starkware.starknet.common.storage import Storage

struct Message:
    member to: felt
    member selector: felt
    member calldata: felt*
    member calldata_size: felt
    member nonce: felt
end

@storage_var
func current_nonce() -> (res: felt):
end

@storage_var
func public_key() -> (res: felt):
end

@storage_var
func initialized() -> (res: felt):
end

@storage_var
func L1_address() -> (res: felt):
end

@external
func initialize{
        storage_ptr: Storage*,
        pedersen_ptr: HashBuiltin*,
        range_check_ptr
    } (_public_key: felt, _L1_address: felt):
    let (_initialized) = initialized.read()
    assert _initialized = 0
    initialized.write(1)

    public_key.write(_public_key)
    L1_address.write(_L1_address)
    return ()
end

@external
func execute{
        storage_ptr: Storage*,
        pedersen_ptr: HashBuiltin*,
        syscall_ptr: felt*,
        range_check_ptr
    } (
        to: felt,
        selector: felt,
        calldata_len: felt,
        calldata: felt*
    ) -> (response : felt):
    alloc_locals

    let (_current_nonce) = current_nonce.read()

    let (__fp__, _) = get_fp_and_pc()
    local message: Message = Message(to, selector, calldata, calldata_size=calldata_len, _current_nonce)

    # bump nonce
    current_nonce.write(_current_nonce + 1)

    # execute call
    let response = call_contract(
        contract_address=message.to,
        function_selector=message.selector,
        calldata_size=message.calldata_size,
        calldata=message.calldata
    )

    return (response=response.retdata_size)
end

##
# Getters
##

@external
func get_public_key{ storage_ptr: Storage*, pedersen_ptr: HashBuiltin*, range_check_ptr }() -> (res: felt):
    let (res) = public_key.read()
    return (res=res)
end

@external
func get_L1_address{ storage_ptr: Storage*, pedersen_ptr: HashBuiltin*, range_check_ptr }() -> (res: felt):
    let (res) = L1_address.read()
    return (res=res)
end

%lang starknet
%builtins pedersen range_check

from starkware.cairo.common.hash import hash2
from starkware.cairo.common.registers import get_fp_and_pc
from starkware.cairo.common.cairo_builtins import HashBuiltin, SignatureBuiltin
from starkware.starknet.common.syscalls import call_contract


@external
func execute{
        pedersen_ptr: HashBuiltin*,
        syscall_ptr : felt*,
        range_check_ptr
    } (
        to: felt,
        selector: felt,
        calldata_len: felt,
        calldata: felt*
    ) -> (response : felt):
    alloc_locals

    let (__fp__, _) = get_fp_and_pc()

    # execute call
    let response = call_contract(
        contract_address=to,
        function_selector=selector,
        calldata_size=calldata_len,
        calldata=calldata
    )

    return (response=response.retdata_size)
end

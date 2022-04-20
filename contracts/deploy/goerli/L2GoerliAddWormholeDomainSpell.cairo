%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.uint256 import Uint256

@contract_interface
namespace IGateway:
  func file(what : felt, domain : felt, data : felt):
  end
end

@external
func execute{
    syscall_ptr : felt*,
    pedersen_ptr : HashBuiltin*,
    range_check_ptr
  }():
    let gateway = 0x03eb04547e41428efbcba7f694886698e41fb5aedcfcf5b4f02f722232f9ab3c
    let what = 'valid_domains'
    # ethers.utils.formatBytes32String("GOERLI-SLAVE-STARKNET-1")
    let domain = 0x474f45524c492d534c4156452d535441524b4e45542d31000000000000000000

    # file domain
    IGateway.file(gateway, what, domain, 1)

    return ()
end

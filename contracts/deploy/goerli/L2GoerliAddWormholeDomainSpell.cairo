
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
    let gateway = 0x06f868433689bef2426268e9bd4c6c13ded0e82e294729fdc6d7cf7744726503
    let what = 'valid_domains'
    # ethers.utils.formatBytes32String("GOERLI-MASTER-1") >> 4
    let domain = 0x474f45524c492d4d41535445522d31000000000000000000000000000000000
    # file domain
    IGateway.file(gateway, what, domain, 1)

    return ()
end
    
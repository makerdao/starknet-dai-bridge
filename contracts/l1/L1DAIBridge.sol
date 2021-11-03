// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface TokenLike {
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);

    function balanceOf(address account) external view returns (uint256);
}

interface StarkNetLike {
    function sendMessageToL2(
        uint256 to_address,
        uint256 selector,
        uint256[] calldata payload
    ) external;

    function consumeMessageFromL2(
        uint256 from_address,
        uint256[] calldata payload
    ) external;
}

contract L1DAIBridge {
    // --- Auth ---
    mapping(address => uint256) public wards;

    function rely(address usr) external auth {
        wards[usr] = 1;
        emit Rely(usr);
    }

    function deny(address usr) external auth {
        wards[usr] = 0;
        emit Deny(usr);
    }

    modifier auth() {
        require(wards[msg.sender] == 1, "L1DAIBridge/not-authorized");
        _;
    }

    event Rely(address indexed usr);
    event Deny(address indexed usr);


    uint256 public isOpen = 1;

    modifier whenOpen() {
        require(isOpen == 1, "L1DAIBridge/closed");
        _;
    }

    function close() external auth {
        isOpen = 0;
        emit Closed();
    }

    event Closed();

    address public immutable starkNet;
    address public immutable dai;
    address public immutable escrow;
    uint256 public immutable l2DaiBridge;

    uint256 public ceiling = 0;

    uint256 constant FINALIZE_WITHDRAW = 0;

    //  from starkware.starknet.compiler.compile import get_selector_from_name
    //  print(get_selector_from_name('finalize_deposit'))
    uint256 constant DEPOSIT =
        1523838171560039099257556432344066729220707462881094726430257427074598770742;

    //  print(get_selector_from_name('finalize_force_withdrawal'))
    uint256 constant FORCE_WITHDRAW =
        564231610187525314777546578127020298415997786138103002442821814044854275916;

    event Ceiling(uint256 ceiling);
    event Deposit(address indexed from, uint256 indexed to, uint256 amount);
    event FinalizeWithdrawal(address indexed to, uint256 amount);
    event ForceWithdrawal(
        address indexed to,
        uint256 indexed from,
        uint256 amount
    );
    event FinalizeForceWithdrawal(address indexed to, uint256 amount);

    constructor(
        address _starkNet,
        address _dai,
        address _escrow,
        uint256 _l2DaiBridge
    ) {
        wards[msg.sender] = 1;
        emit Rely(msg.sender);

        starkNet = _starkNet;
        dai = _dai;
        escrow = _escrow;
        l2DaiBridge = _l2DaiBridge;
    }

    function setCeiling(uint256 _ceiling) external auth whenOpen {
        ceiling = _ceiling;
        emit Ceiling(_ceiling);
    }

    function deposit(
        address from,
        uint256 to,
        uint256 amount
    ) external whenOpen {
        TokenLike(dai).transferFrom(from, escrow, amount);

        require(
            TokenLike(dai).balanceOf(escrow) <= ceiling,
            "L1DAIBridge/above-ceiling"
        );

        uint256[] memory payload = new uint256[](2);
        payload[0] = to;
        payload[1] = amount;

        StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, DEPOSIT, payload);

        emit Deposit(from, to, amount);
    }

    struct SplitUint256 {
      uint256 low;
      uint256 high;
    }

    function toSplitUint(uint256 value) internal pure returns (SplitUint256 memory) {
      uint256 low = value & ((1 << 128) - 1);
      uint256 high = value >> 128;
      return SplitUint256(low, high);
    }

    function finalizeWithdrawal(address to, uint256 amount) external {
        SplitUint256 memory amount_split = toSplitUint(amount);
        uint256[] memory payload = new uint256[](4);
        payload[0] = FINALIZE_WITHDRAW;
        payload[1] = uint256(uint160(msg.sender));
        payload[2] = amount_split.low;
        payload[3] = amount_split.high;

        StarkNetLike(starkNet).consumeMessageFromL2(l2DaiBridge, payload);
        TokenLike(dai).transferFrom(escrow, to, amount);

        emit FinalizeWithdrawal(to, amount);
    }

    function forceWithdrawal(uint256 from, uint256 amount) external whenOpen {
        SplitUint256 memory amount_split = toSplitUint(amount);
        uint256[] memory payload = new uint256[](4);
        payload[0] = from;
        payload[1] = uint256(uint160(msg.sender));
        payload[2] = amount_split.low;
        payload[3] = amount_split.high;

        StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, FORCE_WITHDRAW, payload);

        emit ForceWithdrawal(msg.sender, from, amount);
    }
}

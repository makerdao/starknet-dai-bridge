// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;

interface TokenLike {
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool success);

    function balanceOf(address account) external view returns (uint256);
}

interface StarkNetLike {
    function sendMessageToL2(
        uint256 to,
        uint256 selector,
        uint256[] calldata payload
    ) external;

    function consumeMessageFromL2(
        uint256 from,
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
    uint256 public immutable l2Dai;
    address public immutable escrow;
    uint256 public immutable l2DaiBridge;

    uint256 public ceiling = 0;

    uint256 constant HANDLE_WITHDRAW = 0;

    //  from starkware.starknet.compiler.compile import get_selector_from_name
    //  print(get_selector_from_name('handle_deposit'))
    uint256 constant DEPOSIT =
        1285101517810983806491589552491143496277809242732141897358598292095611420389;

    //  print(get_selector_from_name('handle_force_withdrawal'))
    uint256 constant FORCE_WITHDRAW =
        1137729855293860737061629600728503767337326808607526258057644140918272132445;

    event Ceiling(uint256 ceiling);
    event Deposit(address indexed from, uint256 indexed to, uint256 amount);
    event HandleWithdrawal(address indexed to, uint256 amount);
    event ForceWithdrawal(
        address indexed to,
        uint256 indexed from,
        uint256 amount
    );
    event HandleForceWithdrawal(address indexed to, uint256 amount);

    constructor(
        address _starkNet,
        address _dai,
        uint256 _l2Dai,
        address _escrow,
        uint256 _l2DaiBridge
    ) {
        wards[msg.sender] = 1;
        emit Rely(msg.sender);

        starkNet = _starkNet;
        dai = _dai;
        l2Dai = _l2Dai;
        escrow = _escrow;
        l2DaiBridge = _l2DaiBridge;
    }

    function setCeiling(uint256 _ceiling) external auth whenOpen {
        ceiling = _ceiling;
        emit Ceiling(_ceiling);
    }

    function deposit(
        uint256 amount,
        uint256 l2Recipient
    ) external whenOpen {
        require(l2Recipient != 0 && l2Recipient != l2Dai, "L1DAIBridge/invalid-address");

        emit Deposit(msg.sender, l2Recipient, amount);

        TokenLike(dai).transferFrom(msg.sender, escrow, amount);

        require(
            TokenLike(dai).balanceOf(escrow) <= ceiling,
            "L1DAIBridge/above-ceiling"
        );

        uint256[] memory payload = new uint256[](3);
        payload[0] = l2Recipient;
        (payload[1], payload[2]) = toSplitUint(amount);

        StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, DEPOSIT, payload);
    }

    function toSplitUint(uint256 value) internal pure returns (uint256, uint256) {
      uint256 low = value & ((1 << 128) - 1);
      uint256 high = value >> 128;
      return (low, high);
    }

    function withdraw(uint256 amount, address recipient) external {
        emit HandleWithdrawal(recipient, amount);

        uint256[] memory payload = new uint256[](4);
        payload[0] = HANDLE_WITHDRAW;
        payload[1] = uint256(uint160(msg.sender));
        (payload[2], payload[3]) = toSplitUint(amount);

        StarkNetLike(starkNet).consumeMessageFromL2(l2DaiBridge, payload);
        TokenLike(dai).transferFrom(escrow, recipient, amount);
    }

    function forceWithdrawal(uint256 from, uint256 amount) external whenOpen {
        emit ForceWithdrawal(msg.sender, from, amount);

        uint256[] memory payload = new uint256[](4);
        payload[0] = from;
        payload[1] = uint256(uint160(msg.sender));
        (payload[2], payload[3]) = toSplitUint(amount);

        StarkNetLike(starkNet).sendMessageToL2(l2DaiBridge, FORCE_WITHDRAW, payload);
    }
}

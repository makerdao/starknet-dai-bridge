import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException


L1_ADDRESS = 0x1
INVALID_L1_ADDRESS = 0x10000000000000000000000000000000000000000
L1_BRIDGE_ADDRESS = 0x1
FINALIZE_WITHDRAW = 0

L2_CONTRACTS_DIR = os.path.join(os.getcwd(), "contracts/l2")
DAI_FILE = os.path.join(L2_CONTRACTS_DIR, "dai.cairo")
ACCOUNT_FILE = os.path.join(L2_CONTRACTS_DIR, "account.cairo")
REGISTRY_FILE = os.path.join(L2_CONTRACTS_DIR, "registry.cairo")
BRIDGE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_bridge.cairo")


@pytest.fixture
async def starknet() -> Starknet:
    return await Starknet.empty()


@pytest.fixture
async def user1(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=ACCOUNT_FILE)


@pytest.fixture
async def user2(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=ACCOUNT_FILE)


@pytest.fixture
async def user3(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=ACCOUNT_FILE)


@pytest.fixture
async def auth_user(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=ACCOUNT_FILE)


@pytest.fixture
async def registry(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(source=REGISTRY_FILE)


@pytest.fixture
async def l2_bridge(
    starknet: Starknet,
    dai: StarknetContract,
    auth_user: StarknetContract,
    registry: StarknetContract,
) -> StarknetContract:
    return await starknet.deploy(
        source=BRIDGE_FILE,
        constructor_calldata=[
            auth_user.contract_address,
            dai.contract_address,
            L1_ADDRESS,
            registry.contract_address,
        ],
    )


@pytest.fixture
async def dai(
    starknet: Starknet,
    auth_user: StarknetContract,
) -> StarknetContract:
    return await starknet.deploy(
            source=DAI_FILE,
            constructor_calldata=[
                auth_user.contract_address,
            ])


burn = 0
no_funds = 1

starknet_contract_address = 0x0


###########
# HELPERS #
###########
def to_split_uint(a):
    return (a & ((1 << 128) - 1), a >> 128)


def to_uint(a):
    return a[0] + (a[1] << 128)


@pytest.fixture
async def check_balances(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):
    async def internal_check_balances(
        expected_user1_balance,
        expected_user2_balance,
    ):
        user1_balance = await dai.balance_of(user1.contract_address).call()
        user2_balance = await dai.balance_of(user2.contract_address).call()
        user3_balance = await dai.balance_of(user3.contract_address).call()
        total_supply = await dai.total_supply().call()

        assert user1_balance.result == (to_split_uint(expected_user1_balance),)
        assert user2_balance.result == (to_split_uint(expected_user2_balance),)
        assert user3_balance.result == (to_split_uint(0),)
        assert total_supply.result == (
                to_split_uint(expected_user1_balance+expected_user2_balance),)

    return internal_check_balances


@pytest.fixture
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(autouse=True)
async def before_all(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    registry: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(auth_user.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(user1.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(user2.contract_address)
    await registry.set_L1_address(
            int(L1_ADDRESS)).invoke(user3.contract_address)

    print("-------------------------------------------")
    print(l2_bridge.contract_address)
    print("-------------------------------------------")

    await dai.rely(
            l2_bridge.contract_address,
        ).invoke(auth_user.contract_address)


@pytest.fixture(autouse=True)
async def before_each(
    dai: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    # intialize two users with 100 DAI
    global user1_balance
    global user2_balance

    await dai.mint(
            user1.contract_address,
            to_split_uint(100)).invoke(auth_user.contract_address)
    await dai.mint(
            user2.contract_address,
            to_split_uint(100)).invoke(auth_user.contract_address)

    balance = await dai.balance_of(user1.contract_address).call()
    user1_balance = to_uint(balance.result[0])
    balance = await dai.balance_of(user2.contract_address).call()
    user2_balance = to_uint(balance.result[0])


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_withdraw(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    await l2_bridge.withdraw(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    payload = [FINALIZE_WITHDRAW, user2.contract_address, *to_split_uint(10)]
    starknet.consume_message_from_l2(
        from_address=l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_close_should_fail_when_not_authorized(
    dai: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(Exception):
        await dai.close().invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_withdraw_should_fail_when_closed(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    await l2_bridge.close().invoke(auth_user.contract_address)

    with pytest.raises(Exception):
        await l2_bridge.withdraw(
                user2.contract_address,
                to_split_uint(10)).invoke(user1.contract_address)

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_withdraw_insufficient_funds(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):
    with pytest.raises(StarkException):
        await l2_bridge.withdraw(
                user2.contract_address,
                to_split_uint(10)).invoke(user3.contract_address)

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_withdraw_invalid_l1_address(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    with pytest.raises(StarkException):
        await l2_bridge.withdraw(
                INVALID_L1_ADDRESS,
                to_split_uint(10)).invoke(user1.contract_address)

    payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
    with pytest.raises(AssertionError):
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_finalize_deposit(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="finalize_deposit",
        payload=[
            user2.contract_address,
            *to_split_uint(10)
        ],
    )

    await check_balances(user1_balance, user2_balance+10)


@pytest.mark.asyncio
async def test_finalize_force_withdrawal(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="finalize_force_withdrawal",
        payload=[
            user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
    starknet.consume_message_from_l2(
        from_address=l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_funds(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    user3: StarknetContract,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user3.contract_address)
    await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="finalize_force_withdrawal",
        payload=[
            user3.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_allowance(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
):
    await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="finalize_force_withdrawal",
        payload=[
            user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_invalid_l1_address(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="finalize_force_withdrawal",
        payload=[
            user1.contract_address,
            int(INVALID_L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
    with pytest.raises(AssertionError):
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(user1_balance, user2_balance)

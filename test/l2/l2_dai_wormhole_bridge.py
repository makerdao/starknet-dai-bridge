import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name


L1_ADDRESS = 0x1
INVALID_L1_ADDRESS = 0x10000000000000000000000000000000000000000
L1_WORMHOLE_BRIDGE_ADDRESS = 0x1
DOMAIN = get_selector_from_name('starknet') # placeholder
TARGET_DOMAIN = get_selector_from_name('optimism') # placeholder
FINALIZE_REGISTER_WORMHOLE = 0
FINALIZE_FLUSH = 1
ECDSA_PUBLIC_KEY = 0

L2_CONTRACTS_DIR = os.path.join(os.getcwd(), "contracts/l2")
DAI_FILE = os.path.join(L2_CONTRACTS_DIR, "dai.cairo")
ACCOUNT_FILE = os.path.join(L2_CONTRACTS_DIR, "account.cairo")
WORMHOLE_BRIDGE_FILE = os.path.join(L2_CONTRACTS_DIR, "l2_dai_wormhole_bridge.cairo")


@pytest.fixture
async def starknet() -> Starknet:
    return await Starknet.empty()


@pytest.fixture
async def user1(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(
        source=ACCOUNT_FILE,
        constructor_calldata=[
            ECDSA_PUBLIC_KEY,
        ],
    )


@pytest.fixture
async def user2(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(
        source=ACCOUNT_FILE,
        constructor_calldata=[
            ECDSA_PUBLIC_KEY,
        ],
    )


@pytest.fixture
async def user3(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(
        source=ACCOUNT_FILE,
        constructor_calldata=[
            ECDSA_PUBLIC_KEY,
        ],
    )


@pytest.fixture
async def auth_user(starknet: Starknet) -> StarknetContract:
    return await starknet.deploy(
        source=ACCOUNT_FILE,
        constructor_calldata=[
            ECDSA_PUBLIC_KEY,
        ],
    )


@pytest.fixture
async def l2_wormhole_bridge(
    starknet: Starknet,
    auth_user: StarknetContract,
    dai: StarknetContract,
) -> StarknetContract:
    return await starknet.deploy(
        source=WORMHOLE_BRIDGE_FILE,
        constructor_calldata=[
            auth_user.contract_address,
            dai.contract_address,
            L1_WORMHOLE_BRIDGE_ADDRESS,
            DOMAIN,
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
        user1_balance = await dai.balanceOf(user1.contract_address).call()
        user2_balance = await dai.balanceOf(user2.contract_address).call()
        user3_balance = await dai.balanceOf(user3.contract_address).call()
        total_supply = await dai.totalSupply().call()

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
    l2_wormhole_bridge: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):

    print("-------------------------------------------")
    print(l2_wormhole_bridge.contract_address)
    print("-------------------------------------------")

    await dai.rely(
            l2_wormhole_bridge.contract_address,
        ).invoke(auth_user.contract_address)
    await l2_wormhole_bridge.file(
            0, TARGET_DOMAIN, 1,
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

    balance = await dai.balanceOf(user1.contract_address).call()
    user1_balance = to_uint(balance.result[0])
    balance = await dai.balanceOf(user2.contract_address).call()
    user2_balance = to_uint(balance.result[0])


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_initiate_wormhole(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_wormhole_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            L1_ADDRESS,
            to_split_uint(10),
            L1_ADDRESS,
        ).invoke(user1.contract_address)

    # check batched dai to flush

    payload = [
        FINALIZE_REGISTER_WORMHOLE,
        DOMAIN,
        TARGET_DOMAIN,
        L1_ADDRESS,
        L1_ADDRESS,
        10,
    ]
    starknet.consume_message_from_l2(
        from_address=l2_wormhole_bridge.contract_address,
        to_address=L1_WORMHOLE_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_flush(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    res = await l2_wormhole_bridge.flush(
            TARGET_DOMAIN,
        ).invoke(user1.contract_address)
    print(res)

    # check batched dai to flush

    payload = [
        FINALIZE_FLUSH,
        TARGET_DOMAIN,
        0, 0,
    ]
    starknet.consume_message_from_l2(
        from_address=l2_wormhole_bridge.contract_address,
        to_address=L1_WORMHOLE_BRIDGE_ADDRESS,
        payload=payload,
    )

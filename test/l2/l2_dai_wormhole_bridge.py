import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name
from starkware.crypto.signature.fast_pedersen_hash import pedersen_hash


L1_ADDRESS = 0x1
INVALID_L1_ADDRESS = 0x10000000000000000000000000000000000000000
L1_WORMHOLE_BRIDGE_ADDRESS = 0x1
DOMAIN = get_selector_from_name("starknet")
TARGET_DOMAIN = get_selector_from_name("optimism")
INVALID_DOMAIN = get_selector_from_name("invalid_domain")
VALID_DOMAINS = 36637008923134637018442198643
WORMHOLE_AMOUNT = 10
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
):
    async def internal_check_balances(
        expected_user1_balance,
    ):
        user1_balance = await dai.balanceOf(user1.contract_address).call()
        user2_balance = await dai.balanceOf(user2.contract_address).call()
        total_supply = await dai.totalSupply().call()

        assert user1_balance.result == (to_split_uint(expected_user1_balance),)
        assert user2_balance.result == (to_split_uint(0),)
        assert total_supply.result == (
                to_split_uint(expected_user1_balance),)

    return internal_check_balances


def check_wormhole_initialized_event(tx, values):
    event = tx.main_call_events[0]
    assert len(event) == 5
    assert event == values


def check_flushed_event(tx, values):
    event = tx.main_call_events[0]
    assert len(event) == 2
    assert event == values


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
):

    print("-------------------------------------------")
    print(l2_wormhole_bridge.contract_address)
    print("-------------------------------------------")

    await dai.rely(
            l2_wormhole_bridge.contract_address,
        ).invoke(auth_user.contract_address)
    await l2_wormhole_bridge.file(
            VALID_DOMAINS, TARGET_DOMAIN, 1,
        ).invoke(auth_user.contract_address)


@pytest.fixture(autouse=True)
async def before_each(
    dai: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
):
    # intialize one user with 100 DAI
    global user1_balance

    await dai.mint(
            user1.contract_address,
            to_split_uint(100)).invoke(auth_user.contract_address)

    balance = await dai.balanceOf(user1.contract_address).call()
    user1_balance = to_uint(balance.result[0])


#########
# TESTS #
#########

## close()
@pytest.mark.asyncio
async def test_can_be_called_by_owner(
    starknet: Starknet,
    auth_user: StarknetContract,
    l2_wormhole_bridge: StarknetContract,
):
    is_open = await l2_wormhole_bridge.is_open().call()
    assert is_open.result == (1,)

    close = await l2_wormhole_bridge.close().invoke(auth_user.contract_address)

    is_open = await l2_wormhole_bridge.is_open().call()
    assert is_open.result == (0,)


@pytest.mark.asyncio
async def test_can_be_called_multiple_times_by_owner(
    starknet: Starknet,
    auth_user: StarknetContract,
    l2_wormhole_bridge: StarknetContract,
):
    close = await l2_wormhole_bridge.close().invoke(auth_user.contract_address)

    is_open = await l2_wormhole_bridge.is_open().call()
    assert is_open.result == (0,)

    close = await l2_wormhole_bridge.close().invoke(auth_user.contract_address)

    is_open = await l2_wormhole_bridge.is_open().call()
    assert is_open.result == (0,)


@pytest.mark.asyncio
async def test_reverts_when_not_called_by_owner(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException):
        await l2_wormhole_bridge.close().invoke(user1.contract_address)


## initiateWormhole()
@pytest.mark.asyncio
async def test_burns_dai_marks_it_for_future_flush(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(l2_wormhole_bridge.contract_address, to_split_uint(WORMHOLE_AMOUNT)).invoke(user1.contract_address)
    tx = await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
<<<<<<< HEAD
            user1.contract_address).invoke(user1.contract_address)
    check_wormhole_initialized_event(tx, (
=======
            user1.contract_address,
            0).invoke(user1.contract_address)
    assert tx.main_call_events[0][:6] == (
>>>>>>> Add timestamps or nonce
        DOMAIN,
        TARGET_DOMAIN,
        user1.contract_address,
        user1.contract_address,
<<<<<<< HEAD
        WORMHOLE_AMOUNT))
=======
        WORMHOLE_AMOUNT,
        0
    )
>>>>>>> Add timestamps or nonce

    wormhole = [
        DOMAIN, # sourceDomain
        TARGET_DOMAIN, # targetDomain
        user1.contract_address, # receiver
        user1.contract_address, # operator
        WORMHOLE_AMOUNT, # amount
        0, # nonce
        tx.main_call_events[0][6] # timestamp
    ]

    await check_balances(user1_balance - WORMHOLE_AMOUNT)
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(WORMHOLE_AMOUNT),)

    payload = [FINALIZE_REGISTER_WORMHOLE, *wormhole]
    with pytest.raises(AssertionError):
        starknet.consume_message_from_l2(
            from_address=l2_wormhole_bridge.contract_address,
            to_address=L1_WORMHOLE_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_sends_xchain_message_burns_dai_marks_it_for_future_flush(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(l2_wormhole_bridge.contract_address, to_split_uint(WORMHOLE_AMOUNT)).invoke(user1.contract_address)
    tx = await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
<<<<<<< HEAD
            user1.contract_address).invoke(user1.contract_address)
    check_wormhole_initialized_event(tx, (
=======
            user1.contract_address,
            0).invoke(user1.contract_address)
    assert tx.main_call_events[0][:6] == (
>>>>>>> Add timestamps or nonce
        DOMAIN,
        TARGET_DOMAIN,
        user1.contract_address,
        user1.contract_address,
<<<<<<< HEAD
        WORMHOLE_AMOUNT))
=======
        WORMHOLE_AMOUNT,
        0
    )
    timestamp = tx.main_call_events[0][6]
>>>>>>> Add timestamps or nonce
    await l2_wormhole_bridge.finalize_register_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address,
            0,
            timestamp).invoke(user1.contract_address)

    wormhole = [
        DOMAIN, # sourceDomain
        TARGET_DOMAIN, # targetDomain
        user1.contract_address, # receiver
        user1.contract_address, # operator
        WORMHOLE_AMOUNT, # amount
        0,
        timestamp
    ]

    await check_balances(user1_balance - WORMHOLE_AMOUNT)
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(WORMHOLE_AMOUNT),)

    payload = [FINALIZE_REGISTER_WORMHOLE, *wormhole]
    starknet.consume_message_from_l2(
        from_address=l2_wormhole_bridge.contract_address,
        to_address=L1_WORMHOLE_BRIDGE_ADDRESS,
        payload=payload,
    )


@pytest.mark.asyncio
async def test_reverts_when_insufficient_funds(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException):
        await l2_wormhole_bridge.initiate_wormhole(
                TARGET_DOMAIN,
                user2.contract_address,
                WORMHOLE_AMOUNT,
                user2.contract_address,
                0).invoke(user2.contract_address)


@pytest.mark.asyncio
async def test_reverts_when_bridge_is_closed(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await l2_wormhole_bridge.close().invoke(auth_user.contract_address)

    with pytest.raises(StarkException):
        await l2_wormhole_bridge.initiate_wormhole(
                TARGET_DOMAIN,
                user2.contract_address,
                WORMHOLE_AMOUNT,
                user2.contract_address,
                0).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_reverts_when_domain_is_not_whitelisted(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException):
        await l2_wormhole_bridge.initiate_wormhole(
                INVALID_DOMAIN,
                user2.contract_address,
                WORMHOLE_AMOUNT,
                user2.contract_address,
                0).invoke(user1.contract_address)


## flush()
@pytest.mark.asyncio
async def test_flushes_batched_dai(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
):
    await dai.approve(l2_wormhole_bridge.contract_address, to_split_uint(WORMHOLE_AMOUNT * 2)).invoke(user1.contract_address)
    await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address,
            0).invoke(user1.contract_address)
    await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address,
            1).invoke(user1.contract_address)
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(WORMHOLE_AMOUNT * 2),)

    tx = await l2_wormhole_bridge.flush(
            TARGET_DOMAIN,
        ).invoke(user1.contract_address)
    check_flushed_event(tx, (TARGET_DOMAIN, to_split_uint(WORMHOLE_AMOUNT * 2)))

    payload = [
        FINALIZE_FLUSH,
        TARGET_DOMAIN,
        *to_split_uint(WORMHOLE_AMOUNT * 2),
    ]
    starknet.consume_message_from_l2(
        from_address=l2_wormhole_bridge.contract_address,
        to_address=L1_WORMHOLE_BRIDGE_ADDRESS,
        payload=payload,
    )


@pytest.mark.asyncio
async def test_cannot_flush_zero_debt(
    starknet: Starknet,
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
):
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(0),)

    with pytest.raises(StarkException):
        await l2_wormhole_bridge.flush(TARGET_DOMAIN).invoke(user1.contract_address)

import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name
from starkware.starknet.business_logic.transaction_execution_objects import Event
from itertools import chain


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

burn = 0
no_funds = 1

starknet_contract_address = 0x0

def to_split_uint(a):
    return (a & ((1 << 128) - 1), a >> 128)


def check_event(contract, event_name, tx, values):
    expected_event = Event(
        from_address=contract.contract_address,
        keys=[get_selector_from_name(event_name)],
        data=list(chain(*[e if isinstance(e, tuple) else [e] for e in values]))
    )

    print(expected_event)
    print((tx.raw_events if hasattr(tx, 'raw_events') else tx.get_sorted_events()))
    assert expected_event in ( tx.raw_events if hasattr(tx, 'raw_events') else tx.get_sorted_events())


#########
# TESTS #
#########

## close()
@pytest.mark.asyncio
async def test_can_be_called_by_owner(
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
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.close().invoke(user1.contract_address)
    assert "l2_dai_wormhole_bridge/not-authorized" in str(err.value)

# file()
@pytest.mark.asyncio
async def test_file_should_not_accept_invalid_data(
    l2_wormhole_bridge: StarknetContract,
    auth_user: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.file(
                VALID_DOMAINS, TARGET_DOMAIN, -1,
            ).invoke(auth_user.contract_address)
    assert "l2_dai_wormhole_bridge/invalid-data" in str(err.value)
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.file(
                VALID_DOMAINS, TARGET_DOMAIN, 2,
            ).invoke(auth_user.contract_address)
    assert "l2_dai_wormhole_bridge/invalid-data" in str(err.value)


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
            user1.contract_address).invoke(user1.contract_address)

    check_event(
        l2_wormhole_bridge,
        'WormholeInitialized',
        tx,
        (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            0
        )
    )

    wormhole = [
        DOMAIN, # sourceDomain
        TARGET_DOMAIN, # targetDomain
        user1.contract_address, # receiver
        user1.contract_address, # operator
        WORMHOLE_AMOUNT, # amount
        0, # nonce
        tx.main_call_events[0][6] # timestamp
    ]

    await check_balances(100 - WORMHOLE_AMOUNT, 100)
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
async def test_nonce_management___(
    l2_wormhole_bridge: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(l2_wormhole_bridge.contract_address, to_split_uint(WORMHOLE_AMOUNT*2)).invoke(user1.contract_address)
    tx = await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    print(tx)
    check_event(
        l2_wormhole_bridge,
        'WormholeInitialized',
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            0))
    tx = await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_wormhole_bridge,
        'WormholeInitialized',
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            1))


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
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_wormhole_bridge,
        'WormholeInitialized',
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            0))
    timestamp = tx.main_call_events[0][6]
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
        0, # nonce
        timestamp # timestamp
    ]

    await check_balances(100 - WORMHOLE_AMOUNT, 100)
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
    l2_wormhole_bridge: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.initiate_wormhole(
                TARGET_DOMAIN,
                user2.contract_address,
                100 + WORMHOLE_AMOUNT,
                user2.contract_address).invoke(user2.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_reverts_when_invalid_amount(
    l2_wormhole_bridge: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.initiate_wormhole(
                TARGET_DOMAIN,
                user2.contract_address,
                2**128,
                user2.contract_address).invoke(user2.contract_address)
    assert "l2_dai_wormhole_bridge/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_reverts_when_bridge_is_closed(
    l2_wormhole_bridge: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await l2_wormhole_bridge.close().invoke(auth_user.contract_address)

    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.initiate_wormhole(
                TARGET_DOMAIN,
                user2.contract_address,
                WORMHOLE_AMOUNT,
                user2.contract_address).invoke(user1.contract_address)
    assert "l2_dai_wormhole_bridge/bridge-closed" in str(err.value)


@pytest.mark.asyncio
async def test_reverts_when_domain_is_not_whitelisted(
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.initiate_wormhole(
                INVALID_DOMAIN,
                user2.contract_address,
                WORMHOLE_AMOUNT,
                user2.contract_address).invoke(user1.contract_address)
    assert "l2_dai_wormhole_bridge/invalid-domain" in str(err.value)


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
            user1.contract_address).invoke(user1.contract_address)
    await l2_wormhole_bridge.initiate_wormhole(
            TARGET_DOMAIN,
            user1.contract_address,
            WORMHOLE_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(WORMHOLE_AMOUNT * 2),)

    tx = await l2_wormhole_bridge.flush(
            TARGET_DOMAIN,
        ).invoke(user1.contract_address)
    check_event(l2_wormhole_bridge, "Flushed", tx, (TARGET_DOMAIN, to_split_uint(WORMHOLE_AMOUNT * 2)))

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
    l2_wormhole_bridge: StarknetContract,
    user1: StarknetContract,
):
    batched_dai_to_flush = await l2_wormhole_bridge.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(0),)

    with pytest.raises(StarkException) as err:
        await l2_wormhole_bridge.flush(TARGET_DOMAIN).invoke(user1.contract_address)
    assert "l2_dai_wormhole_bridge/value-is-zero" in str(err.value)

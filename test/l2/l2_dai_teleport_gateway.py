import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name
from starkware.crypto.signature.fast_pedersen_hash import pedersen_hash
from conftest import to_split_uint, to_uint, check_event, VALID_DOMAINS
from starkware.starknet.business_logic.execution.objects import Event
from itertools import chain
import pprint

L1_ADDRESS = 0x1
INVALID_L1_ADDRESS = 0x10000000000000000000000000000000000000000
L1_TELEPORT_BRIDGE_ADDRESS = 0x1
DOMAIN = get_selector_from_name("starknet")
TARGET_DOMAIN = get_selector_from_name("optimism")
INVALID_DOMAIN = get_selector_from_name("invalid_domain")
TELEPORT_AMOUNT = 10
FINALIZE_REGISTER_TELEPORT = 0
FINALIZE_FLUSH = 1
ECDSA_PUBLIC_KEY = 0

burn = 0
no_funds = 1

starknet_contract_address = 0x0


#########
# TESTS #
#########

## close()
@pytest.mark.asyncio
async def test_can_be_called_by_owner(
    auth_user: StarknetContract,
    l2_teleport_gateway: StarknetContract,
):
    is_open = await l2_teleport_gateway.is_open().call()
    assert is_open.result == (1,)

    close = await l2_teleport_gateway.close().invoke(auth_user.contract_address)

    is_open = await l2_teleport_gateway.is_open().call()
    assert is_open.result == (0,)


@pytest.mark.asyncio
async def test_can_be_called_multiple_times_by_owner(
    auth_user: StarknetContract,
    l2_teleport_gateway: StarknetContract,
):
    close = await l2_teleport_gateway.close().invoke(auth_user.contract_address)

    is_open = await l2_teleport_gateway.is_open().call()
    assert is_open.result == (0,)

    close = await l2_teleport_gateway.close().invoke(auth_user.contract_address)

    is_open = await l2_teleport_gateway.is_open().call()
    assert is_open.result == (0,)


@pytest.mark.asyncio
async def test_close_reverts_when_not_called_by_owner(
    l2_teleport_gateway: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.close().invoke(user1.contract_address)
    assert "l2_dai_teleport_gateway/not-authorized" in str(err.value)


@pytest.mark.asyncio
async def test_file_should_not_accept_invalid_what(
    l2_teleport_gateway: StarknetContract,
    auth_user: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.file(
                TARGET_DOMAIN, TARGET_DOMAIN, 0,
            ).invoke(auth_user.contract_address)
    assert "l2_dai_teleport_gateway/file-unrecognized-param" in str(err.value)

@pytest.mark.asyncio
async def test_file_should_not_accept_invalid_data(
    l2_teleport_gateway: StarknetContract,
    auth_user: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.file(
                VALID_DOMAINS, TARGET_DOMAIN, -1,
            ).invoke(auth_user.contract_address)
    assert "l2_dai_teleport_gateway/invalid-data" in str(err.value)
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.file(
                VALID_DOMAINS, TARGET_DOMAIN, 2,
            ).invoke(auth_user.contract_address)
    assert "l2_dai_teleport_gateway/invalid-data" in str(err.value)

@pytest.mark.asyncio
async def test_file_reverts_when_not_called_by_owner(
    l2_teleport_gateway: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.file(
                VALID_DOMAINS, TARGET_DOMAIN, 0,
            ).invoke(user1.contract_address)
    assert "l2_dai_teleport_gateway/not-authorized" in str(err.value)


## initiateTeleport()
@pytest.mark.asyncio
async def test_burns_dai_marks_it_for_future_flush(
    starknet: Starknet,
    l2_teleport_gateway: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
    block_timestamp
):
    await dai.approve(l2_teleport_gateway.contract_address, to_split_uint(TELEPORT_AMOUNT)).invoke(user1.contract_address)
    tx = await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_teleport_gateway,
        "TeleportInitialized",
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            TELEPORT_AMOUNT,
            0,
            block_timestamp()
        )
    )

    teleport = [
        DOMAIN, # sourceDomain
        TARGET_DOMAIN, # targetDomain
        user1.contract_address, # receiver
        user1.contract_address, # operator
        TELEPORT_AMOUNT, # amount
        0, # nonce
        block_timestamp() # timestamp
    ]

    await check_balances(100 - TELEPORT_AMOUNT, 100)
    batched_dai_to_flush = await l2_teleport_gateway.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(TELEPORT_AMOUNT),)

    payload = [FINALIZE_REGISTER_TELEPORT, *teleport]
    with pytest.raises(AssertionError):
        starknet.consume_message_from_l2(
            from_address=l2_teleport_gateway.contract_address,
            to_address=L1_TELEPORT_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_nonce_management(
    l2_teleport_gateway: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
    block_timestamp
):
    await dai.approve(l2_teleport_gateway.contract_address, to_split_uint(TELEPORT_AMOUNT*2)).invoke(user1.contract_address)
    tx = await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_teleport_gateway,
        "TeleportInitialized",
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            TELEPORT_AMOUNT,
            0,
            block_timestamp()
        )
    )

    tx = await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_teleport_gateway,
        "TeleportInitialized",
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            TELEPORT_AMOUNT,
            1,
            block_timestamp()
        )
    )


@pytest.mark.asyncio
async def test_sends_xchain_message_burns_dai_marks_it_for_future_flush(
    starknet: Starknet,
    l2_teleport_gateway: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
    block_timestamp
):
    await dai.approve(l2_teleport_gateway.contract_address, to_split_uint(TELEPORT_AMOUNT)).invoke(user1.contract_address)
    tx = await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    check_event(
        l2_teleport_gateway,
        "TeleportInitialized",
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            TELEPORT_AMOUNT,
            0,
            block_timestamp()
        )
    )

    timestamp = block_timestamp()

    await l2_teleport_gateway.finalize_register_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address,
            0,
            timestamp).invoke(user1.contract_address)

    teleport = [
        DOMAIN, # sourceDomain
        TARGET_DOMAIN, # targetDomain
        user1.contract_address, # receiver
        user1.contract_address, # operator
        TELEPORT_AMOUNT, # amount
        0, # nonce
        timestamp # timestamp
    ]

    await check_balances(100 - TELEPORT_AMOUNT, 100)
    batched_dai_to_flush = await l2_teleport_gateway.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(TELEPORT_AMOUNT),)

    payload = [FINALIZE_REGISTER_TELEPORT, *teleport]
    starknet.consume_message_from_l2(
        from_address=l2_teleport_gateway.contract_address,
        to_address=L1_TELEPORT_BRIDGE_ADDRESS,
        payload=payload,
    )


@pytest.mark.asyncio
async def test_reverts_when_insufficient_funds(
    l2_teleport_gateway: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.initiate_teleport(
                TARGET_DOMAIN,
                user2.contract_address,
                100 + TELEPORT_AMOUNT,
                user2.contract_address).invoke(user2.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_reverts_when_invalid_amount(
    l2_teleport_gateway: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.initiate_teleport(
                TARGET_DOMAIN,
                user2.contract_address,
                2**128,
                user2.contract_address).invoke(user2.contract_address)
    assert "l2_dai_teleport_gateway/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_reverts_when_gateway_is_closed(
    l2_teleport_gateway: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await l2_teleport_gateway.close().invoke(auth_user.contract_address)

    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.initiate_teleport(
                TARGET_DOMAIN,
                user2.contract_address,
                TELEPORT_AMOUNT,
                user2.contract_address).invoke(user1.contract_address)
    assert "l2_dai_teleport_gateway/gateway-closed" in str(err.value)


@pytest.mark.asyncio
async def test_allows_to_finalize_when_closed(
    l2_teleport_gateway: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
    auth_user: StarknetContract,
    block_timestamp
):
    await dai.approve(l2_teleport_gateway.contract_address, to_split_uint(TELEPORT_AMOUNT)).invoke(user1.contract_address)


    tx = await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)

    timestamp = block_timestamp()

    check_event(
        l2_teleport_gateway,
        "TeleportInitialized",
        tx, (
            DOMAIN,
            TARGET_DOMAIN,
            user1.contract_address,
            user1.contract_address,
            TELEPORT_AMOUNT,
            0,
            timestamp
        )
    )

    await l2_teleport_gateway.close().invoke(auth_user.contract_address)

    await l2_teleport_gateway.finalize_register_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address,
            0,
            timestamp).invoke(user1.contract_address)


@pytest.mark.asyncio
async def test_reverts_when_domain_is_not_whitelisted(
    l2_teleport_gateway: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.initiate_teleport(
                INVALID_DOMAIN,
                user2.contract_address,
                TELEPORT_AMOUNT,
                user2.contract_address).invoke(user1.contract_address)
    assert "l2_dai_teleport_gateway/invalid-domain" in str(err.value)


## flush()
@pytest.mark.asyncio
async def test_flushes_batched_dai(
    starknet: Starknet,
    l2_teleport_gateway: StarknetContract,
    dai: StarknetContract,
    user1: StarknetContract,
):
    await dai.approve(l2_teleport_gateway.contract_address, to_split_uint(TELEPORT_AMOUNT * 2)).invoke(user1.contract_address)
    await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    await l2_teleport_gateway.initiate_teleport(
            TARGET_DOMAIN,
            user1.contract_address,
            TELEPORT_AMOUNT,
            user1.contract_address).invoke(user1.contract_address)
    batched_dai_to_flush = await l2_teleport_gateway.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(TELEPORT_AMOUNT * 2),)

    tx = await l2_teleport_gateway.flush(
            TARGET_DOMAIN,
        ).invoke(user1.contract_address)
    check_event(
        l2_teleport_gateway,
        "Flushed",
        tx, (
            TARGET_DOMAIN,
            to_split_uint(TELEPORT_AMOUNT * 2)
        )
    )

    payload = [
        FINALIZE_FLUSH,
        TARGET_DOMAIN,
        *to_split_uint(TELEPORT_AMOUNT * 2),
    ]
    starknet.consume_message_from_l2(
        from_address=l2_teleport_gateway.contract_address,
        to_address=L1_TELEPORT_BRIDGE_ADDRESS,
        payload=payload,
    )


@pytest.mark.asyncio
async def test_cannot_flush_zero_debt(
    l2_teleport_gateway: StarknetContract,
    user1: StarknetContract,
):
    batched_dai_to_flush = await l2_teleport_gateway.batched_dai_to_flush(TARGET_DOMAIN).call()
    assert batched_dai_to_flush.result == (to_split_uint(0),)

    with pytest.raises(StarkException) as err:
        await l2_teleport_gateway.flush(TARGET_DOMAIN).invoke(user1.contract_address)
    assert "l2_dai_teleport_gateway/value-is-zero" in str(err.value)

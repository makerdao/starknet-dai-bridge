import pytest

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.business_logic.execution.objects import Event
from starkware.starknet.public.abi import get_selector_from_name
from itertools import chain

L1_ADDRESS = 0x1
INVALID_L1_ADDRESS = 0x10000000000000000000000000000000000000000
L1_BRIDGE_ADDRESS = 0x1
FINALIZE_WITHDRAW = 0
ECDSA_PUBLIC_KEY = 0

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

def check_event(contract, event_name, tx, values):
    expected_event = Event(
        from_address=contract.contract_address,
        keys=[get_selector_from_name(event_name)],
        data=list(chain(*[e if isinstance(e, tuple) else [e] for e in values]))
    )
    assert expected_event in ( tx.raw_events if hasattr(tx, 'raw_events') else tx.get_sorted_events())

#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_initiate_withdraw(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    tx = await l2_bridge.initiate_withdraw(
            L1_ADDRESS,
            to_split_uint(10)).invoke(user1.contract_address)

    check_event(
        l2_bridge,
        'withdraw_initiated',
        tx,
        (L1_ADDRESS, to_split_uint(10), user1.contract_address)
    )

    payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
    starknet.consume_message_from_l2(
        from_address=l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_close_should_fail_when_not_authorized(
    l2_bridge: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_bridge.close().invoke(user1.contract_address)
    assert "l2_dai_bridge/not-authorized" in str(err.value)


@pytest.mark.asyncio
async def test_initiate_withdraw_should_fail_when_closed(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    await l2_bridge.close().invoke(auth_user.contract_address)

    with pytest.raises(StarkException) as err:
        await l2_bridge.initiate_withdraw(
                user2.contract_address,
                to_split_uint(10)).invoke(user1.contract_address)
    assert "l2_dai_bridge/bridge-closed" in str(err.value)

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_initiate_withdraw_insufficient_funds(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user3: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await l2_bridge.initiate_withdraw(
                L1_ADDRESS,
                to_split_uint(10)).invoke(user3.contract_address)
    assert "dai/insufficient-balance" in str(err.value)

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
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)
    with pytest.raises(StarkException) as err:
        await l2_bridge.initiate_withdraw(
                INVALID_L1_ADDRESS,
                to_split_uint(10)).invoke(user1.contract_address)
    assert "l2_dai_bridge/invalid-l1-address" in str(err.value)

    payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
    with pytest.raises(AssertionError):
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(100, 100)


@pytest.mark.asyncio
async def test_handle_deposit(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    tx = await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="handle_deposit",
        payload=[
            user2.contract_address,
            *to_split_uint(10),
            L1_ADDRESS
        ],
    )

    check_event(
        l2_bridge, 'deposit_handled', tx, (user2.contract_address, to_split_uint(10))
    )

    await check_balances(100, 110)


@pytest.mark.asyncio
async def test_handle_force_withdrawal(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    tx = await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    check_event(
        l2_bridge,
        'force_withdrawal_handled',
        tx,
        (int(L1_ADDRESS), to_split_uint(10), user1.contract_address)
    )

    payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
    starknet.consume_message_from_l2(
        from_address=l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_handle_force_withdrawal_insufficient_funds(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    user3: StarknetContract,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user3.contract_address)

    tx = await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            user3.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    check_event(
        l2_bridge,
        'force_withdrawal_handled',
        tx,
        (int(L1_ADDRESS), to_split_uint(10), user3.contract_address)
    )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_handle_force_withdrawal_insufficient_allowance(
    starknet: Starknet,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
):
    tx = await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    check_event(
        l2_bridge,
        'force_withdrawal_handled',
        tx,
        (int(L1_ADDRESS), to_split_uint(10), user1.contract_address)
    )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_handle_force_withdrawal_invalid_l1_address(
    starknet: Starknet,
    dai: StarknetContract,
    l2_bridge: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.approve(
            l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    tx = await starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            user1.contract_address,
            int(INVALID_L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    check_event(
        l2_bridge,
        'force_withdrawal_handled',
        tx,
        (int(INVALID_L1_ADDRESS), to_split_uint(10), user1.contract_address)
    )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
        starknet.consume_message_from_l2(
            from_address=l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(100, 100)

import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.definitions.error_codes import StarknetErrorCode


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


async def check_balances(
    ctx,
    expected_user1_balance,
    expected_user2_balance,
):
    user1_balance = await ctx.dai.balanceOf(ctx.user1.contract_address).call()
    user2_balance = await ctx.dai.balanceOf(ctx.user2.contract_address).call()
    user3_balance = await ctx.dai.balanceOf(ctx.user3.contract_address).call()
    total_supply = await ctx.dai.totalSupply().call()

    assert user1_balance.result == (to_split_uint(expected_user1_balance),)
    assert user2_balance.result == (to_split_uint(expected_user2_balance),)
    assert user3_balance.result == (to_split_uint(0),)
    assert total_supply.result == (
            to_split_uint(expected_user1_balance+expected_user2_balance),)


def check_event(event_name, tx, values):
    event = tx.main_call_events[0]
    assert type(event).__name__ == event_name
    assert event == values


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_initiate_withdraw(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)

    tx = await ctx.l2_bridge.initiate_withdraw(
            L1_ADDRESS,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    check_event(
        'withdraw_initiated',
        tx,
        ((L1_ADDRESS, to_split_uint(10), ctx.user1.contract_address))
    )

    payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
    ctx.starknet.consume_message_from_l2(
        from_address=ctx.l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(ctx, 90, 100)


@pytest.mark.asyncio
async def test_close_should_fail_when_not_authorized(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.l2_bridge.close().invoke(ctx.user1.contract_address)
    assert "l2_dai_bridge/not-authorized" in str(err.value)


@pytest.mark.asyncio
async def test_initiate_withdraw_should_fail_when_closed(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)

    await ctx.l2_bridge.close().invoke(ctx.auth_user.contract_address)

    with pytest.raises(StarkException) as err:
        await ctx.l2_bridge.initiate_withdraw(
                ctx.user2.contract_address,
                to_split_uint(10)).invoke(ctx.user1.contract_address)
    assert "l2_dai_bridge/bridge-closed" in str(err.value)

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_initiate_withdraw_insufficient_funds(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.l2_bridge.initiate_withdraw(
                L1_ADDRESS,
                to_split_uint(10)).invoke(ctx.user3.contract_address)
    assert "dai/insufficient-balance" in str(err.value)

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_withdraw_invalid_l1_address(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)
    with pytest.raises(StarkException) as err:
        await ctx.l2_bridge.initiate_withdraw(
                INVALID_L1_ADDRESS,
                to_split_uint(10)).invoke(ctx.user1.contract_address)
    assert "l2_dai_bridge/invalid-l1-address" in str(err.value)

    payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
    with pytest.raises(AssertionError):
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(ctx, 100, 100)


@pytest.mark.asyncio
async def test_handle_deposit(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=ctx.l2_bridge.contract_address,
        selector="handle_deposit",
        payload=[
            ctx.user2.contract_address,
            *to_split_uint(10)
        ],
    )

    # check_event(
    #     'deposit_handled', tx, ((user2.contract_address, to_split_uint(10)))
    # )

    await check_balances(ctx, 100, 110)


@pytest.mark.asyncio
async def test_handle_force_withdrawal(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)

    tx = await ctx.starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=ctx.l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            ctx.user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    # check_event(
    #     'force_withdrawal_handled',
    #     tx,
    #     ((int(L1_ADDRESS), to_split_uint(10), user1.contract_address))
    # )

    payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
    ctx.starknet.consume_message_from_l2(
        from_address=ctx.l2_bridge.contract_address,
        to_address=L1_BRIDGE_ADDRESS,
        payload=payload,
    )

    await check_balances(ctx, 90, 100)


@pytest.mark.asyncio
async def test_handle_force_withdrawal_insufficient_funds(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user3.contract_address)

    tx = await ctx.starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=ctx.l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            ctx.user3.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    # check_event(
    #     'force_withdrawal_handled',
    #     tx,
    #     ((int(L1_ADDRESS), to_split_uint(10), user3.contract_address))
    # )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_handle_force_withdrawal_insufficient_allowance(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=ctx.l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            ctx.user1.contract_address,
            int(L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    # check_event(
    #     'force_withdrawal_handled',
    #     tx,
    #     ((int(L1_ADDRESS), to_split_uint(10), user1.contract_address))
    # )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, L1_ADDRESS, *to_split_uint(10)]
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )


@pytest.mark.asyncio
async def test_handle_force_withdrawal_invalid_l1_address(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.l2_bridge.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)

    tx = await ctx.starknet.send_message_to_l2(
        from_address=L1_BRIDGE_ADDRESS,
        to_address=ctx.l2_bridge.contract_address,
        selector="handle_force_withdrawal",
        payload=[
            ctx.user1.contract_address,
            int(INVALID_L1_ADDRESS),
            *to_split_uint(10)
        ],
    )

    # check_event(
    #     'force_withdrawal_handled',
    #     tx,
    #     ((int(L1_ADDRESS), to_split_uint(10), user1.contract_address))
    # )

    with pytest.raises(AssertionError):
        payload = [FINALIZE_WITHDRAW, INVALID_L1_ADDRESS, *to_split_uint(10)]
        ctx.starknet.consume_message_from_l2(
            from_address=ctx.l2_bridge.contract_address,
            to_address=L1_BRIDGE_ADDRESS,
            payload=payload,
        )

    await check_balances(ctx, 100, 100)

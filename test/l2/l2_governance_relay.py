
import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException


L1_ADDRESS = 0x1
L1_GOVERNANCE_ADDRESS = 0x1
L1_BRIDGE_ADDRESS = 0x1
EXECUTE = 1017745666394979726211766185068760164586829337678283062942418931026954492996
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


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_governance_relay(ctx_factory):
    ctx = ctx_factory()
    await ctx.starknet.send_message_to_l2(
        from_address=L1_GOVERNANCE_ADDRESS,
        to_address=ctx.l2_governance_relay.contract_address,
        selector="relay",
        payload=[ctx.sample_spell.contract_address],
    )

    await check_balances(ctx, 110, 100)


@pytest.mark.asyncio
async def test_governance_relay_revoke_auth(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException):
        await ctx.sample_spell.execute().invoke()

    await check_balances(ctx, 100, 100)

import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException


MAX = (2**128-1, 2**128-1)
L1_ADDRESS = 0x1
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


def check_transfer_event(tx, values):
    event = tx.main_call_events[0]
    assert type(event).__name__ == 'Transfer'
    assert len(event) == 3
    assert event == values


def check_approval_event(tx, values):
    event = tx.main_call_events[0]
    assert type(event).__name__ == 'Approval'
    assert len(event) == 3
    assert event == values


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
async def test_total_supply(ctx_factory):
    ctx = ctx_factory()
    total_supply = await ctx.dai.totalSupply().call()

    assert total_supply.result == (to_split_uint(200),)


@pytest.mark.asyncio
async def test_balance_of(ctx_factory):
    ctx = ctx_factory()
    balance = await ctx.dai.balanceOf(ctx.user1.contract_address).call()

    assert balance.result == (to_split_uint(100),)


@pytest.mark.asyncio
async def test_transfer(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.dai.transfer(
            ctx.user2.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        ctx.user2.contract_address,
        to_split_uint(10)))

    await check_balances(
        ctx,
        90,
        110)


@pytest.mark.asyncio
async def test_transfer_to_yourself(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.dai.transfer(
            ctx.user1.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user1.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        ctx.user1.contract_address,
        to_split_uint(10)))

    await check_balances(ctx, 100, 100)


@pytest.mark.asyncio
async def test_transfer_from(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user3.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)
    tx = await ctx.dai.transferFrom(
        ctx.user1.contract_address,
        ctx.user2.contract_address,
        to_split_uint(10)).invoke(ctx.user3.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        ctx.user2.contract_address,
        to_split_uint(10)))

    await check_balances(
        ctx,
        90,
        110)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.dai.transferFrom(
        ctx.user1.contract_address,
        ctx.user1.contract_address,
        to_split_uint(10)).invoke(ctx.user1.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        ctx.user1.contract_address,
        to_split_uint(10)))


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.transfer(
                ctx.user2.contract_address,
                to_split_uint(101),
            ).invoke(ctx.user1.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.transfer(burn, to_split_uint(10)).invoke()
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.transfer(ctx.dai.contract_address, to_split_uint(10)).invoke()
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_mint(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.mint(
            ctx.user1.contract_address,
            to_split_uint(10)).invoke(ctx.auth_user.contract_address)

    await check_balances(ctx, 110, 100)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.mint(
                burn, to_split_uint(10)).invoke(ctx.auth_user.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.mint(
                ctx.dai.contract_address,
                to_split_uint(10),
            ).invoke(ctx.auth_user.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max(ctx_factory):
    ctx = ctx_factory()

    assert (await ctx.dai.totalSupply().call()).result != (to_split_uint(0),)

    with pytest.raises(StarkException) as err:
        await ctx.dai.mint(
            ctx.user3.contract_address,
            to_split_uint(2**256-1)).invoke(ctx.auth_user.contract_address)
    assert "dai/uint256-overflow" in str(err.value)


@pytest.mark.asyncio
async def test_burn(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.burn(
        ctx.user1.contract_address,
        to_split_uint(10),
    ).invoke(ctx.user1.contract_address)

    await check_balances(ctx, 90, 100)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.burn(
                ctx.user1.contract_address,
                to_split_uint(101),
            ).invoke(ctx.user1.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_burn_other(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.burn(
                ctx.user1.contract_address,
                to_split_uint(10),
            ).invoke(ctx.user2.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_deployer_should_not_be_able_to_burn(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.burn(
            ctx.user1.contract_address,
            to_split_uint(10),
        ).invoke(ctx.auth_user.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_approve(ctx_factory):
    ctx = ctx_factory()
    tx = await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)
    check_approval_event(tx, (
        ctx.user1.contract_address,
        ctx.user2.contract_address,
        to_split_uint(10)))

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user2.contract_address).call()

    assert allowance.result == (to_split_uint(10),)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    tx = await ctx.dai.burn(
            ctx.user1.contract_address,
            to_split_uint(10)).invoke(ctx.user2.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        0,
        to_split_uint(10)))

    await check_balances(ctx, 90, 100)


# ALLOWANCE
@pytest.mark.asyncio
async def test_approve_should_not_accept_invalid_amount(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.approve(
                ctx.user2.contract_address,
                (2**128, 2**128)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance_should_not_accept_invalid_amount(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.decreaseAllowance(
                ctx.user2.contract_address,
                (2**128, 2**128)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance_should_not_accept_invalid_amount(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.increaseAllowance(
                ctx.user2.contract_address,
                (2**128, 2**128)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_approve_should_not_accept_zero_address(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.approve(0, to_split_uint(1)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance_should_not_accept_zero_addresses(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.decreaseAllowance(0, to_split_uint(0)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance_should_not_accept_zero_addresses(ctx_factory):
    ctx = ctx_factory()
    with pytest.raises(StarkException) as err:
        await ctx.dai.increaseAllowance(0, to_split_uint(1)).invoke(ctx.user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)

    with pytest.raises(StarkException) as err:
        await ctx.dai.increaseAllowance(0, to_split_uint(1)).invoke(0)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user3.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    await ctx.dai.transferFrom(
            ctx.user1.contract_address,
            ctx.user2.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user3.contract_address)

    await check_balances(ctx, 90, 110)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user3.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user3.contract_address).call()

    with pytest.raises(StarkException) as err:
        await ctx.dai.transferFrom(
            ctx.user1.contract_address,
            ctx.user2.contract_address,
            to_split_uint(to_uint(allowance.result[0])+1),
        ).invoke(ctx.user3.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    tx = await ctx.dai.burn(
            ctx.user1.contract_address,
            to_split_uint(10)).invoke(ctx.user2.contract_address)
    check_transfer_event(tx, (ctx.user1.contract_address, 0, to_split_uint(10)))

    await check_balances(ctx, 90, 100)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user2.contract_address).call()

    with pytest.raises(StarkException) as err:
        await ctx.dai.burn(
                ctx.user1.contract_address,
                to_split_uint(to_uint(allowance.result[0])+1),
            ).invoke(ctx.user2.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)
    await ctx.dai.increaseAllowance(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user2.contract_address).call()
    assert allowance.result == (to_split_uint(20),)


@pytest.mark.asyncio
async def test_should_not_increase_allowance_beyond_max(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)
    with pytest.raises(StarkException) as err:
        await ctx.dai.increaseAllowance(
                ctx.user2.contract_address, MAX).invoke(ctx.user1.contract_address)
    assert "dai/uint256-overflow" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)
    await ctx.dai.decreaseAllowance(
            ctx.user2.contract_address,
            to_split_uint(1)).invoke(ctx.user1.contract_address)

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user2.contract_address).call()
    assert allowance.result == (to_split_uint(9),)


@pytest.mark.asyncio
async def test_should_not_decrease_allowance_beyond_allowance(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user2.contract_address,
            to_split_uint(10)).invoke(ctx.user1.contract_address)

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user2.contract_address).call()

    with pytest.raises(StarkException) as err:
        await ctx.dai.decreaseAllowance(
            ctx.user2.contract_address,
            to_split_uint(to_uint(allowance.result[0]) + 1),
        ).invoke(ctx.user1.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


# MAXIMUM ALLOWANCE
@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_transfer_from(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user3.contract_address, MAX).invoke(ctx.user1.contract_address)
    tx = await ctx.dai.transferFrom(
            ctx.user1.contract_address,
            ctx.user2.contract_address,
            to_split_uint(10),
        ).invoke(ctx.user3.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        ctx.user2.contract_address,
        to_split_uint(10)))

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user3.contract_address).call()
    assert allowance.result == (MAX,)
    await check_balances(ctx, 90, 110)


@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_burn(ctx_factory):
    ctx = ctx_factory()
    await ctx.dai.approve(
            ctx.user3.contract_address, MAX).invoke(ctx.user1.contract_address)
    tx = await ctx.dai.burn(
            ctx.user1.contract_address,
            to_split_uint(10)).invoke(ctx.user3.contract_address)
    check_transfer_event(tx, (
        ctx.user1.contract_address,
        0,
        to_split_uint(10)))

    allowance = await ctx.dai.allowance(
        ctx.user1.contract_address,
        ctx.user3.contract_address).call()
    assert allowance.result == (MAX,)
    await check_balances(ctx, 90, 100)


@pytest.mark.asyncio
async def test_has_metadata(ctx_factory):
    ctx = ctx_factory()
    name = await ctx.dai.name().call()
    assert name.result == (1386921519817957956156419516361070,)

    symbol = await ctx.dai.symbol().call()
    assert symbol.result == (4473161,)

    decimals = await ctx.dai.decimals().call()
    assert decimals.result == (18,)

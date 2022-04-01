import pytest

from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.business_logic.transaction_execution_objects import Event
from starkware.starknet.public.abi import get_selector_from_name
from itertools import chain
from conftest import to_split_uint, to_uint


MAX = (2**128-1, 2**128-1)
L1_ADDRESS = 0x1
ECDSA_PUBLIC_KEY = 0

burn = 0
no_funds = 1

starknet_contract_address = 0x0

###########
# HELPERS #
###########
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
async def test_total_supply(
    dai: StarknetContract,
    user1: StarknetContract,
):
    total_supply = await dai.totalSupply().call()

    assert total_supply.result == (to_split_uint(200),)


@pytest.mark.asyncio
async def test_balance_of(
    dai: StarknetContract,
    user1: StarknetContract,
):
    balance = await dai.balanceOf(user1.contract_address).call()

    assert balance.result == (to_split_uint(100),)


@pytest.mark.asyncio
async def test_transfer(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    check_balances
):
    tx = await dai.transfer(
            user2.contract_address,
            to_split_uint(10),
        ).invoke(user1.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        user2.contract_address,
        to_split_uint(10)
    ))

    await check_balances(90, 110)


@pytest.mark.asyncio
async def test_transfer_to_yourself(
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    tx = await dai.transfer(
        user1.contract_address,
        to_split_uint(10),
    ).invoke(user1.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        user1.contract_address,
        to_split_uint(10)
    ))

    await check_balances(100, 100)


@pytest.mark.asyncio
async def test_transfer_from(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
    check_balances,
):
    await dai.approve(
            user3.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)
    tx = await dai.transferFrom(
        user1.contract_address,
        user2.contract_address,
        to_split_uint(10)
    ).invoke(user3.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        user2.contract_address,
        to_split_uint(10)
    ))

    await check_balances(90, 110)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from(
    dai: StarknetContract,
    user1: StarknetContract,
):
    tx = await dai.transferFrom(
        user1.contract_address,
        user1.contract_address,
        to_split_uint(10)).invoke(user1.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        user1.contract_address,
        to_split_uint(10)
    ))

@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.transfer(
                user2.contract_address,
                to_split_uint(101),
            ).invoke(user1.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address(
    dai: StarknetContract
):
    with pytest.raises(StarkException) as err:
        await dai.transfer(burn, to_split_uint(10)).invoke()
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address(
    dai: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.transfer(dai.contract_address, to_split_uint(10)).invoke()
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_mint(
    dai: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.mint(
            user1.contract_address,
            to_split_uint(10)).invoke(auth_user.contract_address)

    await check_balances(110, 100)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address(
    dai: StarknetContract,
    auth_user: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.mint(
                burn, to_split_uint(10)).invoke(auth_user.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address(
    dai: StarknetContract,
    auth_user: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.mint(
                dai.contract_address,
                to_split_uint(10),
            ).invoke(auth_user.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max(
    dai: StarknetContract,
    auth_user: StarknetContract,
    user3: StarknetContract,
):
    assert (await dai.totalSupply().call()).result != (to_split_uint(0),)

    with pytest.raises(StarkException) as err:
        await dai.mint(
            user3.contract_address,
            to_split_uint(2**256-1)).invoke(auth_user.contract_address)
    assert "dai/uint256-overflow" in str(err.value)


@pytest.mark.asyncio
async def test_burn(
    dai: StarknetContract,
    user1: StarknetContract,
    check_balances,
):
    await dai.burn(
        user1.contract_address,
        to_split_uint(10),
    ).invoke(user1.contract_address)

    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance(
    dai: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.burn(
                user1.contract_address,
                to_split_uint(101),
            ).invoke(user1.contract_address)
    assert "dai/insufficient-balance" in str(err.value)


@pytest.mark.asyncio
async def test_should_not_burn_other(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.burn(
                user1.contract_address,
                to_split_uint(10),
            ).invoke(user2.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_deployer_should_not_be_able_to_burn(
    dai: StarknetContract,
    auth_user: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.burn(
            user1.contract_address,
            to_split_uint(10),
        ).invoke(auth_user.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_approve(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    tx = await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    check_event(dai, 'Approval', tx, (
        user1.contract_address,
        user2.contract_address,
        to_split_uint(10)
    ))

    allowance = await dai.allowance(
        user1.contract_address,
        user2.contract_address).call()

    assert allowance.result == (to_split_uint(10),)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    tx = await dai.burn(
            user1.contract_address,
            to_split_uint(10)).invoke(user2.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        0,
        to_split_uint(10)
    ))

    await check_balances(90, 100)


# ALLOWANCE
@pytest.mark.asyncio
async def test_approve_should_not_accept_invalid_amount(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.approve(
                user2.contract_address,
                (2**128, 2**128)).invoke(user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance_should_not_accept_invalid_amount(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.decreaseAllowance(
                user2.contract_address,
                (2**128, 2**128)).invoke(user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance_should_not_accept_invalid_amount(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.increaseAllowance(
                user2.contract_address,
                (2**128, 2**128)).invoke(user1.contract_address)
    assert "dai/invalid-amount" in str(err.value)


@pytest.mark.asyncio
async def test_approve_should_not_accept_zero_address(
    dai: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.approve(0, to_split_uint(1)).invoke(user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance_should_not_accept_zero_addresses(
    dai: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.decreaseAllowance(0, to_split_uint(0)).invoke(user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance_should_not_accept_zero_addresses(
    dai: StarknetContract,
    user1: StarknetContract,
):
    with pytest.raises(StarkException) as err:
        await dai.increaseAllowance(0, to_split_uint(1)).invoke(user1.contract_address)
    assert "dai/invalid-recipient" in str(err.value)

    with pytest.raises(StarkException) as err:
        await dai.increaseAllowance(0, to_split_uint(1)).invoke(0)
    assert "dai/invalid-recipient" in str(err.value)


@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
    check_balances,
):
    await dai.approve(
            user3.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    await dai.transferFrom(
            user1.contract_address,
            user2.contract_address,
            to_split_uint(10),
        ).invoke(user3.contract_address)

    await check_balances(90, 110)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
):
    await dai.approve(
            user3.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    allowance = await dai.allowance(
        user1.contract_address,
        user3.contract_address).call()

    with pytest.raises(StarkException) as err:
        await dai.transferFrom(
            user1.contract_address,
            user2.contract_address,
            to_split_uint(to_uint(allowance.result[0])+1),
        ).invoke(user3.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    check_balances,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    tx = await dai.burn(
            user1.contract_address,
            to_split_uint(10)).invoke(user2.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        0,
        to_split_uint(10)
    ))

    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    allowance = await dai.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException) as err:
        await dai.burn(
                user1.contract_address,
                to_split_uint(to_uint(allowance.result[0])+1),
            ).invoke(user2.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


@pytest.mark.asyncio
async def test_increase_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)
    await dai.increaseAllowance(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    allowance = await dai.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (to_split_uint(20),)


@pytest.mark.asyncio
async def test_should_not_increase_allowance_beyond_max(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)
    with pytest.raises(StarkException) as err:
        await dai.increaseAllowance(
                user2.contract_address, MAX).invoke(user1.contract_address)
    assert "dai/uint256-overflow" in str(err.value)


@pytest.mark.asyncio
async def test_decrease_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)
    await dai.decreaseAllowance(
            user2.contract_address,
            to_split_uint(1)).invoke(user1.contract_address)

    allowance = await dai.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance.result == (to_split_uint(9),)


@pytest.mark.asyncio
async def test_should_not_decrease_allowance_beyond_allowance(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
):
    await dai.approve(
            user2.contract_address,
            to_split_uint(10)).invoke(user1.contract_address)

    allowance = await dai.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException) as err:
        await dai.decreaseAllowance(
            user2.contract_address,
            to_split_uint(to_uint(allowance.result[0]) + 1),
        ).invoke(user1.contract_address)
    assert "dai/insufficient-allowance" in str(err.value)


# MAXIMUM ALLOWANCE
@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_transfer_from(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
    check_balances,
):
    await dai.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    tx = await dai.transferFrom(
            user1.contract_address,
            user2.contract_address,
            to_split_uint(10),
        ).invoke(user3.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        user2.contract_address,
        to_split_uint(10)
    ))

    allowance = await dai.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)
    await check_balances(90, 110)


@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_burn(
    dai: StarknetContract,
    user1: StarknetContract,
    user2: StarknetContract,
    user3: StarknetContract,
    check_balances,
):
    await dai.approve(
            user3.contract_address, MAX).invoke(user1.contract_address)
    tx = await dai.burn(
            user1.contract_address,
            to_split_uint(10)).invoke(user3.contract_address)

    check_event(dai, 'Transfer', tx, (
        user1.contract_address,
        0,
        to_split_uint(10)
    ))

    allowance = await dai.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance.result == (MAX,)
    await check_balances(90, 100)


@pytest.mark.asyncio
async def test_has_metadata(
    dai: StarknetContract,
):
    name = await dai.name().call()
    assert name.result == (1386921519817957956156419516361070,)

    symbol = await dai.symbol().call()
    assert symbol.result == (4473161,)

    decimals = await dai.decimals().call()
    assert decimals.result == (18,)

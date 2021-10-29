import os
import json
import pytest
import asyncio

from starkware.starknet.compiler.compile import (
    compile_starknet_files)
from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from starkware.starknet.public.abi import get_selector_from_name

# The path to the contract source code.
L2_CONTRACTS_DIR = os.path.join(
    os.getcwd(), "contracts/l2")
MAX = 2**120
L1_ADDRESS = 0x1

async def initialize():
    global starknet
    starknet = await Starknet.empty()


async def deploy(contract_name):
    CONTRACT_FILE = os.path.join(L2_CONTRACTS_DIR, contract_name)
    contract = await starknet.deploy(CONTRACT_FILE)

    return contract


starknet = None
bridge_contract = None
dai_contract = None
l2_governance_relay = None
spell = None
registry_contract = None

# constant addresses
burn = 0
no_funds = 1

auth_user = None
user1 = None
user2 = None
user3 = None

'''
L1_DEPLOYMENTS_DIR = os.path.join(
        os.getcwd(), 'deployments/localhost')
with open(L1_DEPLOYMENTS_DIR + '/Starknet.json') as f:
    starknet_contract_json = json.load(f)
starknet_contract_address = starknet_contract_json['address']
starknet_contract_abi = starknet_contract_json['abi']
starknet_contract = w3.eth.contract(
    address=starknet_contract_address)
'''
starknet_contract_address = 0x0


###########
# HELPERS #
###########
async def check_balances(
    expected_user1_balance,
    expected_user2_balance,
):
    user1_balance = await dai_contract.balanceOf(user1.contract_address).call()
    user2_balance = await dai_contract.balanceOf(user2.contract_address).call()
    user3_balance = await dai_contract.balanceOf(user3.contract_address).call()
    total_supply = await dai_contract.totalSupply().call()

    assert user1_balance == (expected_user1_balance,)
    assert user2_balance == (expected_user2_balance,)
    assert user3_balance == (0,)
    assert total_supply == (expected_user1_balance+expected_user2_balance,)


async def call_from(call, user):
    selector = get_selector_from_name(call.function_abi['name'])
    res = await user.execute(
        call.contract_address,
        selector,
        call.calldata,
    ).invoke()
    return res


@pytest.fixture(scope="session")
def event_loop():
    return asyncio.get_event_loop()


@pytest.fixture(scope="session", autouse=True)
async def before_all():
    await initialize()

    global registry_contract
    registry_contract = await deploy("registry.cairo")

    global auth_user
    global user1
    global user2
    global user3
    auth_user = await deploy("account.cairo")
    user1 = await deploy("account.cairo")
    user2 = await deploy("account.cairo")
    user3 = await deploy("account.cairo")

    call = registry_contract.register(int(L1_ADDRESS))
    await call_from(call, auth_user)
    await call_from(call, user1)
    await call_from(call, user2)
    await call_from(call, user3)

    global bridge_contract
    global dai_contract
    bridge_contract = await deploy("l2_dai_bridge.cairo")
    dai_contract = await deploy("dai.cairo")



    print("-------------------------------------------")
    print(bridge_contract.contract_address)
    print("-------------------------------------------")

    # TODO: replace starknet_contract_address with L1 bridge address
    call = bridge_contract.initialize(
        dai_contract.contract_address,
        int(starknet_contract_address),
        registry_contract.contract_address,
        bridge_contract.contract_address,
    )
    await call_from(call, auth_user)

    call = dai_contract.initialize()
    await call_from(call, auth_user)

    call = dai_contract.rely(bridge_contract.contract_address)
    await call_from(call, auth_user)

    global l2_governance_relay
    l2_governance_relay = await deploy("l2_governance_relay.cairo")
    await l2_governance_relay.initialize(
        int(starknet_contract_address),
        dai_contract.contract_address,
        bridge_contract.contract_address,
    ).invoke()

    call = dai_contract.rely(l2_governance_relay.contract_address)
    await call_from(call, auth_user)
    call = bridge_contract.rely(l2_governance_relay.contract_address)
    await call_from(call, auth_user)

    global spell
    spell = await deploy("sample_spell.cairo")
    await spell.initialize(dai_contract.contract_address, user2.contract_address).invoke()


@pytest.fixture(scope="function", autouse=True)
async def before_each():
    # intialize two users with 100 DAI
    global user1_balance
    global user2_balance

    call1 = dai_contract.mint(user1.contract_address, 100)
    call2 = dai_contract.mint(user2.contract_address, 100)
    await call_from(call1, auth_user)
    await call_from(call2, auth_user)

    balance = await dai_contract.balanceOf(user1.contract_address).call()
    user1_balance = balance[0]
    balance = await dai_contract.balanceOf(user2.contract_address).call()
    user2_balance = balance[0]


#######
# DAI #
#######
@pytest.mark.asyncio
async def test_total_supply():
    total_supply = await dai_contract.totalSupply().call()

    assert total_supply == (200,)


@pytest.mark.asyncio
async def test_balance_of():
    balance = await dai_contract.balanceOf(user1.contract_address).call()

    assert balance == (user1_balance,)


@pytest.mark.asyncio
async def test_transfer():
    call = dai_contract.transfer(user2.contract_address, 10)
    await call_from(call, user1)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself():
    call = dai_contract.transfer(user1.contract_address, 10)
    await call_from(call, user1)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_transfer_from():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)
    call2 = dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10)
    await call_from(call2, user3)

    await check_balances(
        user1_balance-10,
        user2_balance+10)


@pytest.mark.asyncio
async def test_transfer_to_yourself_using_transfer_from():
    call = dai_contract.transferFrom(
        user1.contract_address,
        user1.contract_address,
        10)
    await call_from(call, user1)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_balance():
    with pytest.raises(StarkException):
        call = dai_contract.transfer(user2.contract_address, user1_balance+1)
        await call_from(call, user1)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_zero_address():
    with pytest.raises(StarkException):
        await dai_contract.transfer(burn, 10).invoke()

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_transfer_to_dai_address():
    '''
    with pytest.raises(StarkException):
        await dai_contract.transfer(dai_contract.contract_address, 10).invoke()

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_mint():
    call = dai_contract.mint(user1.contract_address, 10)
    await call_from(call, auth_user)

    await check_balances(user1_balance+10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_zero_address():
    with pytest.raises(StarkException):
        call = dai_contract.mint(burn, 10)
        await call_from(call, auth_user)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_dai_address():
    '''
    with pytest.raises(StarkException):
        call = dai_contract.mint(
                dai_contract.contract_address,
                10,
            )
        await call_from(call, auth_user)

    await check_balances(user1_balance, user2_balance)
    '''
    pass


@pytest.mark.asyncio
async def test_should_not_allow_minting_to_address_beyond_max():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_burn():
    call = dai_contract.burn(user1.contract_address, 10)
    await call_from(call, user1)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_balance():
    with pytest.raises(StarkException):
        call = dai_contract.burn(user1.contract_address, user1_balance+1)
        await call_from(call, user1)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_other():
    with pytest.raises(StarkException):
        call = dai_contract.burn(user1.contract_address, 10)
        await call_from(call, user2)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_deployer_can_burn_other():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_approve():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    assert allowance == (10,)


@pytest.mark.asyncio
async def test_can_burn_other_if_approved():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.burn(user1.contract_address, 10)
    await call_from(call2, user2)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_approve_to_increase_allowance_with_permit():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_does_not_approve_with_expired_permit():
    # not implemented
    pass


@pytest.mark.asyncio
async def test_does_not_approve_with_invalid_permit():
    # not implemented
    pass


# ALLOWANCE
@pytest.mark.asyncio
async def test_transfer_using_transfer_from_and_allowance():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10)
    await call_from(call2, user3)

    await check_balances(user1_balance-10, user2_balance+10)


@pytest.mark.asyncio
async def test_should_not_transfer_beyond_allowance():
    call = dai_contract.approve(user3.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()

    with pytest.raises(StarkException):
        call2 = dai_contract.transferFrom(
            user1.contract_address,
            user2.contract_address,
            allowance[0]+1)
        await call_from(call2, user3)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_burn_using_burn_and_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    call2 = dai_contract.burn(user1.contract_address, 10)
    await call_from(call2, user2)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_should_not_burn_beyond_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    call2 = dai_contract.burn(user1.contract_address, allowance[0]+1)
    with pytest.raises(StarkException):
        await call_from(call2, user2)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_increase_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)
    call = dai_contract.increaseAllowance(user2.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance == (20,)


@pytest.mark.asyncio
async def test_should_not_increase_allowance_beyond_max():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)
    with pytest.raises(StarkException):
        call = dai_contract.increaseAllowance(user2.contract_address, MAX)
        await call_from(call, user1)


@pytest.mark.asyncio
async def test_decrease_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)
    call = dai_contract.decreaseAllowance(user2.contract_address, 1)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()
    assert allowance == (9,)


@pytest.mark.asyncio
async def test_should_not_decrease_allowance_beyond_allowance():
    call = dai_contract.approve(user2.contract_address, 10)
    await call_from(call, user1)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user2.contract_address).call()

    with pytest.raises(StarkException):
        call = dai_contract.decreaseAllowance(
            user2.contract_address,
            allowance[0] + 1)
        await call_from(call, user1)


# MAXIMUM ALLOWANCE
@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_transfer_from():
    call = dai_contract.approve(user3.contract_address, MAX)
    await call_from(call, user1)
    call = dai_contract.transferFrom(
        user1.contract_address,
        user2.contract_address,
        10,
    )
    await call_from(call, user3)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance == (MAX,)


@pytest.mark.asyncio
async def test_does_not_decrease_allowance_using_burn():
    call = dai_contract.approve(user3.contract_address, MAX)
    await call_from(call, user1)
    call = dai_contract.burn(user1.contract_address, 10)
    await call_from(call, user3)

    allowance = await dai_contract.allowance(
        user1.contract_address,
        user3.contract_address).call()
    assert allowance == (MAX,)


##########
# Bridge #
##########
@pytest.mark.asyncio
async def test_second_initialize():
    with pytest.raises(Exception):
        await bridge_contract.initialize(dai=3, bridge=4,).invoke()


@pytest.mark.asyncio
async def test_withdraw():
    call = dai_contract.approve(bridge_contract.contract_address, 10)
    await call_from(call, user1)
    call = bridge_contract.withdraw(dest=user2.contract_address, amount=10)
    await call_from(call, user1)

    await check_balances(user1_balance-10, user2_balance)

@pytest.mark.asyncio
async def test_withdraw_should_fail_when_closed():
    call = dai_contract.approve(bridge_contract.contract_address, 10)
    await call_from(call, user1)

    call = bridge_contract.close()
    await call_from(call, auth_user)

    with pytest.raises(Exception):
        call = bridge_contract.withdraw(dest=user2.contract_address, amount=10)
        await call_from(call, user1)

@pytest.mark.asyncio
async def test_withdraw_insufficient_funds():
    with pytest.raises(StarkException):
        call = bridge_contract.withdraw(dest=user2.contract_address, amount=10)
        await call_from(call, user3)
    await check_balances(user1_balance, user2_balance)


#############
# Workflows #
#############
@pytest.mark.asyncio
async def test_finalize_deposit():
    # TODO: replace starknet_contract_address with L1 bridge address
    call = bridge_contract.finalize_deposit(
        sender=int(starknet_contract_address),
        dest=user2.contract_address,
        amount=10)
    await call_from(call, user2)

    await check_balances(user1_balance, user2_balance+10)


@pytest.mark.asyncio
async def test_governance_relay_second_initialize():
    with pytest.raises(StarkException):
        await l2_governance_relay.initialize(
            int(starknet_contract_address),
            dai_contract.contract_address,
            bridge_contract.contract_address,
        ).invoke()


@pytest.mark.asyncio
async def test_governance_relay():
    selector = get_selector_from_name('execute')
    await l2_governance_relay.relay(
        int(starknet_contract_address),
        spell.contract_address,
        selector).invoke()

    await check_balances(user1_balance, user2_balance+10)


@pytest.mark.asyncio
async def test_governance_relay_revoke_auth():
    with pytest.raises(StarkException):
        await spell.execute().invoke()


@pytest.mark.asyncio
async def test_finalize_force_withdrawal():
    # TODO: replace starknet_contract_address with L1 bridge address
    call = dai_contract.approve(bridge_contract.contract_address, 10)
    await call_from(call, user1)
    call = bridge_contract.finalize_force_withdrawal(
        sender=int(starknet_contract_address),
        source=user1.contract_address,
        dest=int(L1_ADDRESS),
        amount=10)
    await call_from(call, user1)

    await check_balances(user1_balance-10, user2_balance)


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_funds():
    # TODO: replace starknet_contract_address with L1 bridge address
    call = dai_contract.approve(bridge_contract.contract_address, 10)
    await call_from(call, user3)
    call = bridge_contract.finalize_force_withdrawal(
        sender=int(starknet_contract_address),
        source=user3.contract_address,
        dest=int(L1_ADDRESS),
        amount=10)
    await call_from(call, user3)

    await check_balances(user1_balance, user2_balance)


@pytest.mark.asyncio
async def test_finalize_force_withdrawal_insufficient_allowance():
    # TODO: replace starknet_contract_address with L1 bridge address
    call = bridge_contract.finalize_force_withdrawal(
        sender=int(starknet_contract_address),
        source=user1.contract_address,
        dest=int(L1_ADDRESS),
        amount=10)
    await call_from(call, user1)

    await check_balances(user1_balance, user2_balance)


import os
import pytest
import asyncio

from starkware.starknet.testing.starknet import Starknet
from starkware.starknet.testing.contract import StarknetContract
from starkware.starkware_utils.error_handling import StarkException
from conftest import to_split_uint, to_uint


L1_ADDRESS = 0x1
L1_GOVERNANCE_ADDRESS = 0x1
L1_BRIDGE_ADDRESS = 0x1
EXECUTE = 1017745666394979726211766185068760164586829337678283062942418931026954492996
ECDSA_PUBLIC_KEY = 0

burn = 0
no_funds = 1

starknet_contract_address = 0x0


#########
# TESTS #
#########
@pytest.mark.asyncio
async def test_governance_relay(
    starknet: Starknet,
    l2_governance_relay: StarknetContract,
    sample_spell: StarknetContract,
    check_balances,
):
    await starknet.send_message_to_l2(
        from_address=L1_GOVERNANCE_ADDRESS,
        to_address=l2_governance_relay.contract_address,
        selector="relay",
        payload=[sample_spell.contract_address],
    )

    await check_balances(110, 100)


@pytest.mark.asyncio
async def test_governance_relay_revoke_auth(
    sample_spell: StarknetContract,
    check_balances,
):
    with pytest.raises(StarkException):
        await sample_spell.execute().invoke()

    await check_balances(100, 100)

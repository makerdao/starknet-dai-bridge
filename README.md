# StarkNet DAI Bridge

[![Tests](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml/badge.svg)](https://github.com/makerdao/starknet-dai-bridge/actions/workflows/tests.yml)


## Setup

Create and open a Python3.7 virtual environment. Run the following to install the Python dependencies.
```
pip install -r requirements.txt
```

Install the Node.js dependencies.
```
yarn install
```

Setup environment variables.
```
cp .env.example .env
```

In `.env` set the `INFURA_API_KEY` and `MNEMONIC` variables.


## Run goerli environment
Deploy the contracts
```
yarn compile
yarn deploy:goerli
```

The deploy contracts and abi are stored in a json in `./deployments/NETWORK/CONTRACT_NAME.json`.

## Interactions

### Create Account
```
yarn account:create --name ACCOUNT_NAME
```

### Get Account address
```
yarn account:get --name ACCOUNT_NAME
```

### Deposit
```
yarn call:l1 --contract DAI --func approve --calldata L1DAIBridge,AMOUNT
yarn call:l1 --contract L1DAIBridge --func deposit --calldata L1_ADDRESS,ACCOUNT_NAME,AMOUNT
```

### Withdraw
```
yarn invoke:l2 --contract dai --func approve --calldata l2_dai_bridge,AMOUNT
yarn invoke:l2 --contract l2_dai_bridge --func withdraw --calldata L1_ADDRESS,AMOUNT
yarn call:l1 --contract L1DAIBridge --func finalizeWithdrawal --calldata L1_ADDRESS,AMOUNT
```

### L2 Transfers
```
yarn account:get --name user
yarn invoke:l2 --contract dai --func transfer --calldata ACCOUNT_NAME,AMOUNT
```

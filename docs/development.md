# StarkNet DAI Bridge

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

In `.env` set the `INFURA_API_KEY`, `MNEMONIC`, and `DEFAULT_ECDSA_PRIVATE_KEY` variables.


## Run goerli environment
Deploy the contracts
```
yarn compile
yarn deploy:goerli
```

The deploy contracts and abi are stored in a json in `./deployments/NETWORK/CONTRACT_NAME.json`.

## Interactions

Three types of interaction calls:
 - `call:l1` - use for all layer 1 view and external functions
 - `call:l2` - use for layer 2 view functions
 - `invoke:l2` - use for layer 2 external functions; requires an account contract to be called, if `--name` is not specified it will use `default` account

### Create Account
```
yarn account:create --name ACCOUNT_NAME
```

The account will be initialized with the environment variable set at `[ACCOUNT_NAME]_ECDSA_PRIVATE_KEY`.

### Get Account address
```
yarn account:get --name ACCOUNT_NAME
```

### Set Ceiling
```
yarn call:l1 --contract L1DAIBridge --func setCeiling --calldata AMOUNT
```

### Set Address in Registry
```
yarn invoke:l2 --contract registry --func set_L1_address --calldata calldata L1_ADDRESS
```

### Set Ceiling
```
yarn call:l1 --contract L1DAIBridge --func setCeiling --calldata AMOUNT
```

### Set Address in Registry
```
yarn invoke:l2 --contract registry --func set_L1_address --calldata calldata L1_ADDRESS
```

### Deposit
```
yarn call:l1 --contract DAI --func approve --calldata L1DAIBridge,AMOUNT
yarn call:l1 --contract L1DAIBridge --func deposit --calldata AMOUNT,ACCOUNT_NAME
```

### Withdraw
```
yarn invoke:l2 --contract dai --func approve --calldata l2_dai_bridge,AMOUNT
yarn invoke:l2 --contract l2_dai_bridge --func initiate_withdraw --calldata L1_ADDRESS,AMOUNT
yarn call:l1 --contract L1DAIBridge --func withdraw --calldata AMOUNT,L1_ADDRESS
```

### L2 Transfers
```
yarn account:get --name user
yarn invoke:l2 --contract dai --func transfer --calldata ACCOUNT_NAME,AMOUNT
```

## Testing on mainnet fork
Fork mainnet in local chain
```
yarn fork
```

Set ETH and DAI balance
```
yarn setBalance --address [ETH_ADDRESS] --balance [AMOUNT_IN_ETH]
yarn setDaiBalance --address [ETH_ADDRESS] --balance [AMOUNT_IN_DAI]
```
If `--address` is not specified, it will default to the address of the `MNEMONIC` environment variable.

## Running e2e tests
Warning: still work in progress. First start local l2 testnet:
```
yarn node:l2
```
then:
```
yarn test:e2e
```


## Data Reconstruction Script
A detailed explanation of how state diffs are stored on L1: [Starknet On-Chain Data](https://starknet.io/on-chain-data/)

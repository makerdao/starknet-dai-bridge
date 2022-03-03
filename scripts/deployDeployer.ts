import fs from "fs";
import { ec } from "starknet";
const { getStarkKey } = ec;
import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import { task } from "hardhat/config";

import { deployL2, genAndSaveKeyPair } from "./utils";

task("deploy-deployer", "Deploy deployer").setAction(async (_, hre) => {
  const NETWORK = hre.network.name;

  const STARKNET_NETWORK =
    hre.config.mocha.starknetNetwork || DEFAULT_STARKNET_NETWORK;

  const [l1Signer] = await hre.ethers.getSigners();

  // @ts-ignore
  const BLOCK_NUMBER = await l1Signer.provider.getBlockNumber();

  console.log(`Deploying deployer on ${NETWORK}/${STARKNET_NETWORK}`);

  const keyPair = await genAndSaveKeyPair();
  const publicKey = BigInt(getStarkKey(keyPair));

  const deployer = await deployL2(
    hre,
    "account",
    BLOCK_NUMBER,
    { _public_key: publicKey },
    "account-deployer"
  );

  fs.writeFileSync(
    "deployer-key.json",
    JSON.stringify({ priv: keyPair.priv.toString() })
  );

  console.log(
    `Deployer private key is in deployer-key.json. It should be added to .env under DEPLOYER_ECDSA_PRIVATE_KEY\n`
  );

  console.log(`Next steps:`);
  console.log(`  If You want to deploy dai contract now:`);
  console.log(
    `    STARKNET_NETWORK=${STARKNET_NETWORK} starknet deploy --inputs ${deployer.address} --contract starknet-artifacts/contracts/l2/dai.cairo/dai.json --salt <insert salt here>\n`
  );
  console.log(
    `  After manual dai deployment dai contract address should be added to .env:`
  );
  console.log(`    ${STARKNET_NETWORK.toUpperCase()}_L2_DAI_ADDRESS=...\n`);

  console.log("  To verify dai:");
  console.log(
    `    npx hardhat starknet-verify --starknet-network ${STARKNET_NETWORK} --path contracts/l2/dai.cairo --address <L2_DAI_ADDRESS>\n`
  );

  console.log(
    "  To find salt that will result in dai address staring with 'da1' prefix:"
  );
  console.log(`    ./scripts/vanity.py --ward ${deployer.address}\n`);
});

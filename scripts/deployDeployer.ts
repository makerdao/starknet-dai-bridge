import { DEFAULT_STARKNET_NETWORK } from "@shardlabs/starknet-hardhat-plugin/dist/constants";
import fs from "fs";
import { task } from "hardhat/config";

import { save } from "./utils";

task("deploy-deployer", "Deploy deployer").setAction(async (_, hre) => {
  const STARKNET_NETWORK =
    hre.config.starknet.network || DEFAULT_STARKNET_NETWORK;

  console.log(`Deploying deployer on ${STARKNET_NETWORK}`);

  const deployer = await hre.starknet.deployAccount("OpenZeppelin");
  save("account-deployer", deployer.starknetContract, hre.network.name);

  fs.writeFileSync(
    ".env.deployer",
    `DEPLOYER_ECDSA_PRIVATE_KEY=${deployer.privateKey}`
  );

  console.log(
    `Deployer private key is in .env.deployer. It should be added to .env under DEPLOYER_ECDSA_PRIVATE_KEY\n`
  );

  console.log(`Next steps:`);
  console.log(`  If You want to deploy dai contract now:`);
  console.log(
    `    STARKNET_NETWORK=${STARKNET_NETWORK} starknet deploy --inputs ${deployer.starknetContract.address} --contract starknet-artifacts/contracts/l2/dai.cairo/dai.json --salt <insert salt here>\n`
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
  console.log(
    `    ./scripts/vanity.py --ward ${deployer.starknetContract.address}\n`
  );
});

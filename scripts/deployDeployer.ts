import fs from "fs";
import { task } from "hardhat/config";

import {getNetwork, save} from "./utils";

task("deploy-deployer", "Deploy deployer").setAction(async (_, hre) => {

  const { network, NETWORK } = getNetwork(hre)

  console.log(`Deploying deployer on ${network}`);

  const deployer = await hre.starknet.deployAccount("OpenZeppelin");
  save("account-deployer", deployer.starknetContract, network);

  fs.writeFileSync(
    `.env.${network}.deployer`,
    `${NETWORK}_DEPLOYER_ECDSA_PRIVATE_KEY=${deployer.privateKey}`
  );

  console.log(
    `Deployer private key is in .env.${network}.deployer. It should be added to .env under ${NETWORK}_DEPLOYER_ECDSA_PRIVATE_KEY\n`
  );

  console.log(`Next steps:`);
  console.log(`  If You want to deploy dai contract now:`);
  console.log(
    `    STARKNET_NETWORK=${network} starknet deploy --inputs ${deployer.starknetContract.address} --contract starknet-artifacts/contracts/l2/dai.cairo/dai.json --salt <insert salt here>\n`
  );
  console.log(
    `  After manual dai deployment dai contract address should be added to .env:`
  );
  console.log(`    ${NETWORK}_L2_DAI_ADDRESS=...\n`);

  console.log("  To verify dai:");
  console.log(
    `    npx hardhat starknet-verify --starknet-network ${network} --path contracts/l2/dai.cairo --address <L2_DAI_ADDRESS>\n`
  );

  console.log(
    "  To find salt that will result in dai address staring with 'da1' prefix:"
  );
  console.log(
    `    ./scripts/vanity.py --ward ${deployer.starknetContract.address}\n`
  );
});

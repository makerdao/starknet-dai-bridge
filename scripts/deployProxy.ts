import { task } from "hardhat/config";

import { deployL1 } from "./utils";

task("deploy-proxy", "Deploy proxy").setAction(async (_, hre) => {
  const NETWORK = hre.network.name;

  console.log(`Deploying proxy on ${NETWORK}`);

  await deployL1(hre, "Proxy", 0, []);
});

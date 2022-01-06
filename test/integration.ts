import hre from "hardhat";

describe.only("L1DAIBridge", function () {
  it("initializes properly", async () => {
    console.log('ok!')
    console.log('starknet:', hre.starknet)
    console.log('ethers:', hre.ethers)
  })
})

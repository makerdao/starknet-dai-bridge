import hre from 'hardhat';
import { Artifact } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

const { deployContract } = hre.waffle;

describe('L1 Tests', function () {
  before(async function () {
    this.signers = {};

    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.admin = signers[0];

    const escrowArtifact: Artifact = await hre.artifacts.readArtifact('L1Escrow');
    const escrowInputs: any[] = [];
    this.escrowContract = await deployContract(this.signers.admin, escrowArtifact, escrowInputs);

    const bridgeArtifact: Artifact = await hre.artifacts.readArtifact('L1DAITokenBridge');
    const bridgeInputs: any[] = [];
    this.bridgeContract = await deployContract(this.signers.admin, escrowArtifact, bridgeInputs);
  });

  describe('L1Escrow', function () {
    beforeEach(async function () {
    });

  });

  describe('L1DAITokenBridge', function () {
    beforeEach(async function () {
    });

  });
});

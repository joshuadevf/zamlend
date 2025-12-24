import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const MAX_UINT64 = (1n << 64n) - 1n;

function assertUint64(value: bigint) {
  if (value <= 0n || value > MAX_UINT64) {
    throw new Error("Amount must fit in uint64 and be greater than 0.");
  }
}

task("lend:addresses", "Prints the ZamaLend and ConfidentialZama addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const lend = await hre.deployments.get("ZamaLend");
    const token = await hre.deployments.get("ConfidentialZama");

    console.log(`ZamaLend: ${lend.address}`);
    console.log(`ConfidentialZama: ${token.address}`);
  },
);

task("lend:stake", "Stake ETH into ZamaLend")
  .addParam("amount", "Amount of ETH to stake (e.g. 0.5)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const amountWei = ethers.parseEther(taskArguments.amount);
    assertUint64(amountWei);

    await fhevm.initializeCLIApi();

    const lend = await deployments.get("ZamaLend");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ZamaLend", lend.address, signer);

    const encryptedInput = await fhevm
      .createEncryptedInput(lend.address, signer.address)
      .add64(amountWei)
      .encrypt();

    const tx = await contract.stake(encryptedInput.handles[0], encryptedInput.inputProof, { value: amountWei });
    console.log(`Wait for tx: ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);
  });

task("lend:borrow", "Borrow cZama from ZamaLend")
  .addParam("amount", "Amount of cZama to borrow (e.g. 0.5)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const amount = ethers.parseEther(taskArguments.amount);
    assertUint64(amount);

    await fhevm.initializeCLIApi();

    const lend = await deployments.get("ZamaLend");
    const token = await deployments.get("ConfidentialZama");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ZamaLend", lend.address, signer);

    const lendInput = await fhevm
      .createEncryptedInput(lend.address, signer.address)
      .add64(amount)
      .encrypt();

    const tokenInput = await fhevm
      .createEncryptedInput(token.address, lend.address)
      .add64(amount)
      .encrypt();

    const tx = await contract.borrow(
      lendInput.handles[0],
      lendInput.inputProof,
      tokenInput.handles[0],
      tokenInput.inputProof,
      amount,
    );
    console.log(`Wait for tx: ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);
  });

task("lend:set-operator", "Allow ZamaLend to transfer cZama for repayments")
  .addOptionalParam("days", "Operator allowance duration in days", "30")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const lend = await deployments.get("ZamaLend");
    const token = await deployments.get("ConfidentialZama");
    const [signer] = await ethers.getSigners();
    const czama = await ethers.getContractAt("ConfidentialZama", token.address, signer);

    const durationDays = Number(taskArguments.days);
    const now = Math.floor(Date.now() / 1000);
    const until = now + Math.max(1, durationDays) * 24 * 60 * 60;

    const tx = await czama.setOperator(lend.address, until);
    console.log(`Wait for tx: ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);
  });

task("lend:repay", "Repay cZama to ZamaLend")
  .addParam("amount", "Amount of cZama to repay (e.g. 0.25)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const amount = ethers.parseEther(taskArguments.amount);
    assertUint64(amount);

    await fhevm.initializeCLIApi();

    const lend = await deployments.get("ZamaLend");
    const token = await deployments.get("ConfidentialZama");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ZamaLend", lend.address, signer);

    const encryptedInput = await fhevm
      .createEncryptedInput(token.address, lend.address)
      .add64(amount)
      .encrypt();

    const tx = await contract.repay(encryptedInput.handles[0], encryptedInput.inputProof, amount);
    console.log(`Wait for tx: ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);
  });

task("lend:withdraw", "Withdraw staked ETH from ZamaLend")
  .addParam("amount", "Amount of ETH to withdraw (e.g. 0.1)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const amountWei = ethers.parseEther(taskArguments.amount);
    assertUint64(amountWei);

    await fhevm.initializeCLIApi();

    const lend = await deployments.get("ZamaLend");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("ZamaLend", lend.address, signer);

    const encryptedInput = await fhevm
      .createEncryptedInput(lend.address, signer.address)
      .add64(amountWei)
      .encrypt();

    const tx = await contract.withdraw(encryptedInput.handles[0], encryptedInput.inputProof, amountWei);
    console.log(`Wait for tx: ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx: ${tx.hash} status=${receipt?.status}`);
  });

task("lend:decrypt", "Decrypt encrypted stake, debt, and cZama balance")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const lend = await deployments.get("ZamaLend");
    const token = await deployments.get("ConfidentialZama");
    const [signer] = await ethers.getSigners();

    const lendContract = await ethers.getContractAt("ZamaLend", lend.address, signer);
    const tokenContract = await ethers.getContractAt("ConfidentialZama", token.address, signer);

    const encryptedStake = await lendContract.getEncryptedStake(signer.address);
    const encryptedDebt = await lendContract.getEncryptedDebt(signer.address);
    const encryptedBalance = await tokenContract.confidentialBalanceOf(signer.address);

    const zero = ethers.ZeroHash;

    const stake = encryptedStake === zero
      ? 0n
      : await fhevm.userDecryptEuint(FhevmType.euint64, encryptedStake, lend.address, signer);
    const debt = encryptedDebt === zero
      ? 0n
      : await fhevm.userDecryptEuint(FhevmType.euint64, encryptedDebt, lend.address, signer);
    const balance = encryptedBalance === zero
      ? 0n
      : await fhevm.userDecryptEuint(FhevmType.euint64, encryptedBalance, token.address, signer);

    console.log(`Decrypted stake: ${ethers.formatEther(stake)} ETH`);
    console.log(`Decrypted debt : ${ethers.formatEther(debt)} cZama`);
    console.log(`cZama balance  : ${ethers.formatEther(balance)} cZama`);
  });

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialZama, ConfidentialZama__factory, ZamaLend, ZamaLend__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("ConfidentialZama")) as ConfidentialZama__factory;
  const token = (await tokenFactory.deploy()) as ConfidentialZama;
  await token.waitForDeployment();

  const lendFactory = (await ethers.getContractFactory("ZamaLend")) as ZamaLend__factory;
  const lend = (await lendFactory.deploy(await token.getAddress())) as ZamaLend;
  await lend.waitForDeployment();

  await token.setMinter(await lend.getAddress());

  return { token, lend };
}

describe("ZamaLend", function () {
  let signers: Signers;
  let token: ConfidentialZama;
  let lend: ZamaLend;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, lend } = await deployFixture());
  });

  it("stakes and borrows with encrypted balances", async function () {
    const lendAddress = await lend.getAddress();
    const stakeAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.4");

    const encryptedStake = await fhevm
      .createEncryptedInput(lendAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    await lend
      .connect(signers.alice)
      .stake(encryptedStake.handles[0], encryptedStake.inputProof, { value: stakeAmount });

    const lendBorrowInput = await fhevm
      .createEncryptedInput(lendAddress, signers.alice.address)
      .add64(borrowAmount)
      .encrypt();

    const tokenBorrowInput = await fhevm
      .createEncryptedInput(await token.getAddress(), lendAddress)
      .add64(borrowAmount)
      .encrypt();

    await lend
      .connect(signers.alice)
      .borrow(
        lendBorrowInput.handles[0],
        lendBorrowInput.inputProof,
        tokenBorrowInput.handles[0],
        tokenBorrowInput.inputProof,
        borrowAmount,
      );

    const encryptedStakeOnChain = await lend.getEncryptedStake(signers.alice.address);
    const decryptedStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStakeOnChain,
      lendAddress,
      signers.alice,
    );

    const encryptedDebtOnChain = await lend.getEncryptedDebt(signers.alice.address);
    const decryptedDebt = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedDebtOnChain,
      lendAddress,
      signers.alice,
    );

    const encryptedBalance = await token.confidentialBalanceOf(signers.alice.address);
    const decryptedBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      await token.getAddress(),
      signers.alice,
    );

    expect(decryptedStake).to.eq(stakeAmount);
    expect(decryptedDebt).to.eq(borrowAmount);
    expect(decryptedBalance).to.eq(borrowAmount);
  });

  it("repays and withdraws after enabling operator", async function () {
    const lendAddress = await lend.getAddress();
    const stakeAmount = ethers.parseEther("1");
    const borrowAmount = ethers.parseEther("0.5");
    const repayAmount = ethers.parseEther("0.2");
    const withdrawAmount = ethers.parseEther("0.4");

    const encryptedStake = await fhevm
      .createEncryptedInput(lendAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    await lend
      .connect(signers.alice)
      .stake(encryptedStake.handles[0], encryptedStake.inputProof, { value: stakeAmount });

    const lendBorrowInput = await fhevm
      .createEncryptedInput(lendAddress, signers.alice.address)
      .add64(borrowAmount)
      .encrypt();

    const tokenBorrowInput = await fhevm
      .createEncryptedInput(await token.getAddress(), lendAddress)
      .add64(borrowAmount)
      .encrypt();

    await lend
      .connect(signers.alice)
      .borrow(
        lendBorrowInput.handles[0],
        lendBorrowInput.inputProof,
        tokenBorrowInput.handles[0],
        tokenBorrowInput.inputProof,
        borrowAmount,
      );

    const now = Math.floor(Date.now() / 1000);
    await token.connect(signers.alice).setOperator(lendAddress, now + 24 * 60 * 60);

    const encryptedRepay = await fhevm
      .createEncryptedInput(await token.getAddress(), lendAddress)
      .add64(repayAmount)
      .encrypt();

    await lend.connect(signers.alice).repay(encryptedRepay.handles[0], encryptedRepay.inputProof, repayAmount);

    const encryptedWithdraw = await fhevm
      .createEncryptedInput(lendAddress, signers.alice.address)
      .add64(withdrawAmount)
      .encrypt();

    await lend
      .connect(signers.alice)
      .withdraw(encryptedWithdraw.handles[0], encryptedWithdraw.inputProof, withdrawAmount);

    const encryptedDebtOnChain = await lend.getEncryptedDebt(signers.alice.address);
    const decryptedDebt = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedDebtOnChain,
      lendAddress,
      signers.alice,
    );

    const encryptedStakeOnChain = await lend.getEncryptedStake(signers.alice.address);
    const decryptedStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStakeOnChain,
      lendAddress,
      signers.alice,
    );

    expect(decryptedDebt).to.eq(borrowAmount - repayAmount);
    expect(decryptedStake).to.eq(stakeAmount - withdrawAmount);
  });
});

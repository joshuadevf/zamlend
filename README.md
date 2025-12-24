# ZamaLend

ZamaLend is a privacy-first lending prototype that lets users stake ETH and borrow an encrypted credit token (cZama)
while keeping their balances private with Zama FHEVM.

## Overview

ZamaLend combines standard ETH collateralization with Fully Homomorphic Encryption (FHE) so users can borrow against
their stake without exposing their encrypted balances. The system maintains clear-text accounting for risk checks and
stores FHE handles for private balance tracking and user-side decryption.

## Problem It Solves

- Public blockchains expose balances and lending positions by default.
- Lending protocols often force users to reveal sensitive financial activity.
- Traditional privacy layers are not composable with on-chain risk checks.

ZamaLend solves this by storing encrypted stake and debt in parallel with clear-text guardrails needed for safety,
allowing users to decrypt their position locally without revealing it to others.

## Key Advantages

- Encrypted balances on-chain using FHE handles.
- Local decryption with wallet signatures and short-lived permissions.
- Simple 1:1 collateral model with clear risk checks.
- Transparent contract design with minimal moving parts.
- Separation of concerns: accounting checks in clear, balances in FHE.

## How It Works (User Flow)

1. Stake ETH: Users deposit ETH and submit an encrypted stake amount.
2. Borrow cZama: Users borrow cZama up to their available collateral.
3. Enable operator: Users grant ZamaLend permission to transfer cZama for repayments.
4. Repay: Users repay using encrypted transfers.
5. Withdraw: Users withdraw ETH as long as collateral stays above debt.
6. Decrypt: Users can decrypt their encrypted stake, debt, and balance locally in the UI.

## Architecture

### Smart Contracts

- `ZamaLend` (`contracts/ZamaLend.sol`)
  - Holds ETH collateral and enforces a 1:1 borrow limit.
  - Stores encrypted stake and debt as FHE handles.
  - Tracks clear-text stake and debt for collateral checks.
- `ConfidentialZama` (`contracts/ConfidentialZama.sol`)
  - ERC7984-compatible confidential token (cZama).
  - Minting and burning controlled by ZamaLend.
- `FHECounter` (`contracts/FHECounter.sol`)
  - Example FHE contract included for reference.

### Frontend

- React + Vite UI in `ui/` with TypeScript.
- Read operations use viem, write operations use ethers.
- Zama relayer SDK handles encryption and decryption.
- No local storage is used; the UI is stateless between sessions.

### Encryption and Privacy Model

- Encrypted amounts are stored as FHE handles (bytes32) on-chain.
- Users decrypt locally via signed EIP-712 requests.
- Clear-text stake and debt are stored for risk checks and can be queried with `getAccountSnapshot`.
- The encrypted data is for user privacy, while the clear amounts enforce safety.

## Tech Stack

- Solidity 0.8.27
- Hardhat + hardhat-deploy
- Zama FHEVM Solidity libraries
- OpenZeppelin confidential ERC7984
- TypeScript
- React + Vite
- viem (read-only calls)
- ethers (write transactions)
- RainbowKit + wagmi

## Repository Layout

```
contracts/         Smart contracts
deploy/            Deployment scripts
tasks/             Hardhat tasks
test/              Hardhat tests
types/             Typechain outputs
ui/                Frontend application
```

## Prerequisites

- Node.js 20+
- npm
- A Sepolia account funded for gas (for testnet deployment)

## Install Dependencies

```bash
npm install
```

## Compile and Test

```bash
npm run compile
npm run test
```

Notes:
- The test suite uses the FHEVM mock and will skip on Sepolia.

## Local Development Workflow

1. Start a local node:

   ```bash
   npx hardhat node
   ```

2. Deploy to the local node:

   ```bash
   npx hardhat deploy --network localhost
   ```

3. Use tasks to interact:

   ```bash
   npx hardhat lend:stake --amount 0.5
   npx hardhat lend:borrow --amount 0.2
   npx hardhat lend:set-operator --days 30
   npx hardhat lend:repay --amount 0.1
   npx hardhat lend:withdraw --amount 0.1
   npx hardhat lend:decrypt
   ```

## Sepolia Deployment

Create a `.env` file in the project root with:

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional
```

Notes:
- Use a single private key for deployment; no mnemonic is used.
- `PRIVATE_KEY` may be provided with or without the `0x` prefix.

Deploy to Sepolia:

```bash
npx hardhat deploy --network sepolia
```

After deployment, copy the contract addresses and ABI from `deployments/sepolia` into the UI configuration.

## Frontend Setup

1. Update `ui/src/config/contracts.ts`:
   - Set `LEND_ADDRESS` and `CZAMA_ADDRESS`.
   - Replace ABI entries with the generated ABI from `deployments/sepolia`.

2. Update `ui/src/config/wagmi.ts`:
   - Replace `YOUR_PROJECT_ID` with a WalletConnect project ID.

3. (Optional) Update the Sepolia RPC endpoint in `ui/src/components/LendApp.tsx` (`SEPOLIA_RPC`).

4. Install and run the UI:

```bash
cd ui
npm install
npm run dev
```

## UI Usage Flow

1. Connect wallet to Sepolia.
2. Click "Refresh on-chain data".
3. Click "Decrypt position" to reveal local balances.
4. Stake ETH and borrow cZama.
5. Enable operator access for repayments.
6. Repay debt and withdraw ETH when available.

## Contract Tasks Reference

- `lend:addresses` prints deployed addresses.
- `lend:stake` stakes ETH with encrypted input.
- `lend:borrow` borrows cZama with encrypted input.
- `lend:set-operator` grants repayment operator permissions.
- `lend:repay` repays debt with encrypted transfer.
- `lend:withdraw` withdraws ETH with encrypted input.
- `lend:decrypt` decrypts stake, debt, and cZama balance locally.

## Operational Notes and Constraints

- Borrowing is strictly 1:1 against staked ETH.
- All encrypted values are limited to uint64 for FHE operations.
- The clear-text stake and debt are required for safety checks.
- Operator approval is required before repaying.
- This is a prototype and has not been audited.

## Future Plans

- Add interest rates and configurable collateral factors.
- Introduce liquidation thresholds and safety buffers.
- Add multi-collateral support and multiple markets.
- Expand UI analytics for encrypted positions.
- Improve operator management and session durations.
- Add advanced monitoring and alerting for collateral health.

## License

BSD-3-Clause-Clear

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { createPublicClient, http, isAddress } from 'viem';
import { sepolia } from 'viem/chains';

import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CZAMA_ABI, CZAMA_ADDRESS, LEND_ABI, LEND_ADDRESS } from '../config/contracts';
import '../styles/LendApp.css';

const SEPOLIA_RPC = sepolia.rpcUrls.default.http[0];
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOKEN_DECIMALS = 18;
const MAX_UINT64 = (1n << 64n) - 1n;

type StatusTone = 'info' | 'success' | 'error';

function formatTokenAmount(value: bigint | null) {
  if (value === null) {
    return 'Encrypted';
  }
  return formatUnits(value, TOKEN_DECIMALS);
}

function parseAmount(value: string, decimals: number) {
  if (!value.trim()) {
    return null;
  }
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

export function LendApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: http(SEPOLIA_RPC),
      }),
    [],
  );

  const [stakeInput, setStakeInput] = useState('');
  const [borrowInput, setBorrowInput] = useState('');
  const [repayInput, setRepayInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');

  const [encryptedStake, setEncryptedStake] = useState<string | null>(null);
  const [encryptedDebt, setEncryptedDebt] = useState<string | null>(null);
  const [encryptedBalance, setEncryptedBalance] = useState<string | null>(null);
  const [operatorActive, setOperatorActive] = useState(false);

  const [decryptedStake, setDecryptedStake] = useState<bigint | null>(null);
  const [decryptedDebt, setDecryptedDebt] = useState<bigint | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<StatusTone>('info');

  const normalizedLendAddress = LEND_ADDRESS.toLowerCase();
  const normalizedCzamaAddress = CZAMA_ADDRESS.toLowerCase();
  const addressesReady =
    isAddress(LEND_ADDRESS) &&
    isAddress(CZAMA_ADDRESS) &&
    normalizedLendAddress !== ZERO_ADDRESS &&
    normalizedCzamaAddress !== ZERO_ADDRESS;

  const clearStatus = () => {
    setStatusMessage('');
  };

  const setStatus = (message: string, tone: StatusTone) => {
    setStatusMessage(message);
    setStatusTone(tone);
  };

  const refreshPosition = async () => {
    if (!address || !addressesReady) {
      setEncryptedStake(null);
      setEncryptedDebt(null);
      setEncryptedBalance(null);
      setOperatorActive(false);
      return;
    }

    setIsRefreshing(true);
    try {
      const [stake, debt, balance, operator] = await Promise.all([
        publicClient.readContract({
          address: LEND_ADDRESS,
          abi: LEND_ABI,
          functionName: 'getEncryptedStake',
          args: [address],
        }),
        publicClient.readContract({
          address: LEND_ADDRESS,
          abi: LEND_ABI,
          functionName: 'getEncryptedDebt',
          args: [address],
        }),
        publicClient.readContract({
          address: CZAMA_ADDRESS,
          abi: CZAMA_ABI,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: CZAMA_ADDRESS,
          abi: CZAMA_ABI,
          functionName: 'isOperator',
          args: [address, LEND_ADDRESS],
        }),
      ]);

      setEncryptedStake(stake as string);
      setEncryptedDebt(debt as string);
      setEncryptedBalance(balance as string);
      setOperatorActive(Boolean(operator));
    } catch (error) {
      console.error('Failed to refresh position:', error);
      setStatus('Failed to refresh on-chain state.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      refreshPosition();
    } else {
      setEncryptedStake(null);
      setEncryptedDebt(null);
      setEncryptedBalance(null);
      setOperatorActive(false);
      setDecryptedStake(null);
      setDecryptedDebt(null);
      setDecryptedBalance(null);
    }
  }, [address, isConnected]);

  const encryptAmount = async (amount: bigint, contractAddress: string, importerAddress?: string) => {
    if (!instance || !address) {
      throw new Error('Zama instance is not ready.');
    }
    const input = instance.createEncryptedInput(contractAddress, importerAddress || address);
    input.add64(amount);
    return input.encrypt();
  };

  const decryptPosition = async () => {
    if (!instance || !address || !signerPromise) {
      setStatus('Connect your wallet and wait for Zama to load.', 'error');
      return;
    }

    const handlePairs: { handle: string; contractAddress: string }[] = [];
    const handleContracts = new Set<string>();

    if (encryptedStake && encryptedStake !== ZERO_HASH) {
      handlePairs.push({ handle: encryptedStake, contractAddress: LEND_ADDRESS });
      handleContracts.add(LEND_ADDRESS);
    }
    if (encryptedDebt && encryptedDebt !== ZERO_HASH) {
      handlePairs.push({ handle: encryptedDebt, contractAddress: LEND_ADDRESS });
      handleContracts.add(LEND_ADDRESS);
    }
    if (encryptedBalance && encryptedBalance !== ZERO_HASH) {
      handlePairs.push({ handle: encryptedBalance, contractAddress: CZAMA_ADDRESS });
      handleContracts.add(CZAMA_ADDRESS);
    }

    if (!handlePairs.length) {
      setDecryptedStake(0n);
      setDecryptedDebt(0n);
      setDecryptedBalance(0n);
      return;
    }

    setIsDecrypting(true);
    try {
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = Array.from(handleContracts);

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handlePairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const stakeValue = encryptedStake ? BigInt(result[encryptedStake] ?? 0) : 0n;
      const debtValue = encryptedDebt ? BigInt(result[encryptedDebt] ?? 0) : 0n;
      const balanceValue = encryptedBalance ? BigInt(result[encryptedBalance] ?? 0) : 0n;

      setDecryptedStake(stakeValue);
      setDecryptedDebt(debtValue);
      setDecryptedBalance(balanceValue);
      setStatus('Decryption complete.', 'success');
    } catch (error) {
      console.error('Decryption failed:', error);
      setStatus('Decryption failed. Try again.', 'error');
    } finally {
      setIsDecrypting(false);
    }
  };

  const getLendContract = async () => {
    if (!signerPromise) {
      throw new Error('Wallet not connected.');
    }
    const signer = await signerPromise;
    return new Contract(LEND_ADDRESS, LEND_ABI, signer);
  };

  const getTokenContract = async () => {
    if (!signerPromise) {
      throw new Error('Wallet not connected.');
    }
    const signer = await signerPromise;
    return new Contract(CZAMA_ADDRESS, CZAMA_ABI, signer);
  };

  const validateAmount = (amount: bigint | null): amount is bigint => {
    if (amount === null) {
      setStatus('Enter a valid amount.', 'error');
      return false;
    }
    if (amount <= 0n || amount > MAX_UINT64) {
      setStatus('Amount must fit within uint64.', 'error');
      return false;
    }
    return true;
  };

  const handleStake = async () => {
    clearStatus();
    const amount = parseAmount(stakeInput, TOKEN_DECIMALS);
    if (!validateAmount(amount) || !instance || !address) {
      return;
    }

    setIsWriting(true);
    try {
      const encryptedInput = await encryptAmount(amount, LEND_ADDRESS);
      const contract = await getLendContract();
      const tx = await contract.stake(encryptedInput.handles[0], encryptedInput.inputProof, { value: amount });
      setStatus('Stake submitted. Waiting for confirmation...', 'info');
      await tx.wait();
      setStatus('Stake confirmed.', 'success');
      setStakeInput('');
      await refreshPosition();
    } catch (error) {
      console.error('Stake failed:', error);
      setStatus('Stake failed. Check your wallet and try again.', 'error');
    } finally {
      setIsWriting(false);
    }
  };

  const handleBorrow = async () => {
    clearStatus();
    const amount = parseAmount(borrowInput, TOKEN_DECIMALS);
    if (!validateAmount(amount) || !instance || !address) {
      return;
    }

    setIsWriting(true);
    try {
      const lendInput = await encryptAmount(amount, LEND_ADDRESS);
      const tokenInput = await encryptAmount(amount, CZAMA_ADDRESS, LEND_ADDRESS);
      const contract = await getLendContract();
      const tx = await contract.borrow(
        lendInput.handles[0],
        lendInput.inputProof,
        tokenInput.handles[0],
        tokenInput.inputProof,
        amount,
      );
      setStatus('Borrow submitted. Waiting for confirmation...', 'info');
      await tx.wait();
      setStatus('Borrow confirmed.', 'success');
      setBorrowInput('');
      await refreshPosition();
    } catch (error) {
      console.error('Borrow failed:', error);
      setStatus('Borrow failed. Check your collateral and try again.', 'error');
    } finally {
      setIsWriting(false);
    }
  };

  const handleRepay = async () => {
    clearStatus();
    if (!operatorActive) {
      setStatus('Enable operator access before repaying.', 'error');
      return;
    }

    const amount = parseAmount(repayInput, TOKEN_DECIMALS);
    if (!validateAmount(amount) || !instance || !address) {
      return;
    }

    setIsWriting(true);
    try {
      const encryptedInput = await encryptAmount(amount, CZAMA_ADDRESS, LEND_ADDRESS);
      const contract = await getLendContract();
      const tx = await contract.repay(encryptedInput.handles[0], encryptedInput.inputProof, amount);
      setStatus('Repayment submitted. Waiting for confirmation...', 'info');
      await tx.wait();
      setStatus('Repayment confirmed.', 'success');
      setRepayInput('');
      await refreshPosition();
    } catch (error) {
      console.error('Repay failed:', error);
      setStatus('Repay failed. Check your cZama balance and operator status.', 'error');
    } finally {
      setIsWriting(false);
    }
  };

  const handleWithdraw = async () => {
    clearStatus();
    const amount = parseAmount(withdrawInput, TOKEN_DECIMALS);
    if (!validateAmount(amount) || !instance || !address) {
      return;
    }

    setIsWriting(true);
    try {
      const encryptedInput = await encryptAmount(amount, LEND_ADDRESS);
      const contract = await getLendContract();
      const tx = await contract.withdraw(encryptedInput.handles[0], encryptedInput.inputProof, amount);
      setStatus('Withdrawal submitted. Waiting for confirmation...', 'info');
      await tx.wait();
      setStatus('Withdrawal confirmed.', 'success');
      setWithdrawInput('');
      await refreshPosition();
    } catch (error) {
      console.error('Withdraw failed:', error);
      setStatus('Withdraw failed. Check your available collateral.', 'error');
    } finally {
      setIsWriting(false);
    }
  };

  const handleOperator = async () => {
    clearStatus();
    if (!address) {
      setStatus('Connect your wallet to continue.', 'error');
      return;
    }

    setIsWriting(true);
    try {
      const contract = await getTokenContract();
      const now = Math.floor(Date.now() / 1000);
      const until = now + 30 * 24 * 60 * 60;
      const tx = await contract.setOperator(LEND_ADDRESS, until);
      setStatus('Operator approval submitted...', 'info');
      await tx.wait();
      setStatus('Operator approval confirmed.', 'success');
      await refreshPosition();
    } catch (error) {
      console.error('Operator approval failed:', error);
      setStatus('Operator approval failed. Try again.', 'error');
    } finally {
      setIsWriting(false);
    }
  };

  const availableToBorrow =
    decryptedStake !== null && decryptedDebt !== null
      ? decryptedStake > decryptedDebt
        ? decryptedStake - decryptedDebt
        : 0n
      : null;

  return (
    <div className="lend-app">
      <Header />
      <div className="lend-shell">
        <section className="hero">
          <div className="hero-text">
            <p className="hero-eyebrow">Confidential lending on Sepolia</p>
            <h1>Stake ETH, mint cZama, repay on your terms.</h1>
            <p className="hero-subtitle">
              Your position is encrypted with Zama FHE. Decrypt locally, borrow with confidence, and keep your balances
              private.
            </p>
            <div className="hero-tags">
              <span>FHE-encrypted balances</span>
              <span>No local storage</span>
              <span>Wallet-based encryption</span>
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-card-content">
              <div>
                <p className="card-label">Network</p>
                <h3>Sepolia</h3>
              </div>
              <div>
                <p className="card-label">Position Status</p>
                <p className="card-value">
                  {isConnected ? (operatorActive ? 'Operator enabled' : 'Operator inactive') : 'Wallet disconnected'}
                </p>
              </div>
              <button
                className="outline-button"
                onClick={refreshPosition}
                disabled={!isConnected || isRefreshing || !addressesReady}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh on-chain data'}
              </button>
            </div>
          </div>
        </section>

        {!addressesReady && (
          <div className="status-banner warning">
            Configure `LEND_ADDRESS` and `CZAMA_ADDRESS` in `ui/src/config/contracts.ts` before using the app.
          </div>
        )}

        {zamaError && <div className="status-banner error">Zama error: {zamaError}</div>}

        {statusMessage && (
          <div className={`status-banner ${statusTone === 'error' ? 'error' : statusTone === 'success' ? 'success' : ''}`}>
            {statusMessage}
          </div>
        )}

        <section className="dashboard">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Your encrypted position</h2>
                <p>Decrypt balances locally to reveal your numbers.</p>
              </div>
              <button
                className="primary-button"
                onClick={decryptPosition}
                disabled={!isConnected || isDecrypting || zamaLoading || !addressesReady}
              >
                {isDecrypting ? 'Decrypting...' : zamaLoading ? 'Zama loading...' : 'Decrypt position'}
              </button>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <p>Staked ETH</p>
                <h3>{formatTokenAmount(decryptedStake)}</h3>
              </div>
              <div className="stat-card">
                <p>Borrowed cZama</p>
                <h3>{formatTokenAmount(decryptedDebt)}</h3>
              </div>
              <div className="stat-card">
                <p>cZama balance</p>
                <h3>{formatTokenAmount(decryptedBalance)}</h3>
              </div>
              <div className="stat-card">
                <p>Available to borrow</p>
                <h3>{availableToBorrow !== null ? formatUnits(availableToBorrow, TOKEN_DECIMALS) : 'Encrypted'}</h3>
              </div>
            </div>
            <div className="panel-footer">
              <div>
                <p className="helper-label">Operator access</p>
                <p className="helper-value">{operatorActive ? 'Enabled' : 'Not enabled'}</p>
              </div>
              <button
                className="outline-button"
                onClick={handleOperator}
                disabled={!isConnected || isWriting || !addressesReady}
              >
                Enable operator for repayments
              </button>
            </div>
          </div>

          <div className="action-grid">
            <div className="panel action-panel">
              <h3>Stake ETH</h3>
              <p>Deposit ETH and record the encrypted stake amount.</p>
              <div className="input-row">
                <input
                  value={stakeInput}
                  onChange={(event) => setStakeInput(event.target.value)}
                  placeholder="0.25"
                  inputMode="decimal"
                />
                <span>ETH</span>
              </div>
              <button
                className="primary-button"
                onClick={handleStake}
                disabled={!isConnected || isWriting || !addressesReady}
              >
                Stake ETH
              </button>
            </div>

            <div className="panel action-panel">
              <h3>Borrow cZama</h3>
              <p>Mint cZama against your encrypted collateral.</p>
              <div className="input-row">
                <input
                  value={borrowInput}
                  onChange={(event) => setBorrowInput(event.target.value)}
                  placeholder="0.10"
                  inputMode="decimal"
                />
                <span>cZama</span>
              </div>
              <button
                className="primary-button"
                onClick={handleBorrow}
                disabled={!isConnected || isWriting || !addressesReady}
              >
                Borrow cZama
              </button>
            </div>

            <div className="panel action-panel">
              <h3>Repay cZama</h3>
              <p>Repay your debt with encrypted transfers.</p>
              <div className="input-row">
                <input
                  value={repayInput}
                  onChange={(event) => setRepayInput(event.target.value)}
                  placeholder="0.05"
                  inputMode="decimal"
                />
                <span>cZama</span>
              </div>
              <button
                className="primary-button"
                onClick={handleRepay}
                disabled={!isConnected || isWriting || !addressesReady || !operatorActive}
              >
                Repay cZama
              </button>
            </div>

            <div className="panel action-panel">
              <h3>Withdraw ETH</h3>
              <p>Withdraw collateral while keeping your debt in check.</p>
              <div className="input-row">
                <input
                  value={withdrawInput}
                  onChange={(event) => setWithdrawInput(event.target.value)}
                  placeholder="0.10"
                  inputMode="decimal"
                />
                <span>ETH</span>
              </div>
              <button
                className="primary-button"
                onClick={handleWithdraw}
                disabled={!isConnected || isWriting || !addressesReady}
              >
                Withdraw ETH
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

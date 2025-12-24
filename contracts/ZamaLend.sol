// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHESafeMath} from "@openzeppelin/confidential-contracts/utils/FHESafeMath.sol";
import {ConfidentialZama} from "./ConfidentialZama.sol";

contract ZamaLend is ZamaEthereumConfig {
    ConfidentialZama public immutable czama;

    mapping(address account => uint256) private _stakedEth;
    mapping(address account => uint256) private _debtClear;
    mapping(address account => euint64) private _stakedEncrypted;
    mapping(address account => euint64) private _debtEncrypted;

    event Staked(address indexed account, uint256 amount);
    event Borrowed(address indexed account, uint256 amount);
    event Repaid(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    error InvalidAmount();
    error InsufficientCollateral();
    error InsufficientStake();
    error TransferFailed();
    error InvalidToken();

    constructor(address czamaAddress) {
        if (czamaAddress == address(0)) {
            revert InvalidToken();
        }
        czama = ConfidentialZama(czamaAddress);
    }

    function stake(externalEuint64 encryptedAmount, bytes calldata inputProof) external payable {
        if (msg.value == 0 || msg.value > type(uint64).max) {
            revert InvalidAmount();
        }

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(amount);

        _stakedEth[msg.sender] += msg.value;
        _stakedEncrypted[msg.sender] = _increaseEncrypted(_stakedEncrypted[msg.sender], amount, msg.sender);

        emit Staked(msg.sender, msg.value);
    }

    function borrow(
        externalEuint64 lendEncryptedAmount,
        bytes calldata lendInputProof,
        externalEuint64 tokenEncryptedAmount,
        bytes calldata tokenInputProof,
        uint256 clearAmount
    ) external {
        if (clearAmount == 0 || clearAmount > type(uint64).max) {
            revert InvalidAmount();
        }

        uint256 available = _stakedEth[msg.sender] - _debtClear[msg.sender];
        if (available < clearAmount) {
            revert InsufficientCollateral();
        }

        euint64 amount = FHE.fromExternal(lendEncryptedAmount, lendInputProof);
        FHE.allowThis(amount);

        _debtClear[msg.sender] += clearAmount;
        _debtEncrypted[msg.sender] = _increaseEncrypted(_debtEncrypted[msg.sender], amount, msg.sender);

        czama.mintExternal(msg.sender, tokenEncryptedAmount, tokenInputProof);

        emit Borrowed(msg.sender, clearAmount);
    }

    function repay(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        uint256 clearAmount
    ) external {
        if (clearAmount == 0 || clearAmount > _debtClear[msg.sender]) {
            revert InvalidAmount();
        }

        euint64 transferred = czama.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);
        czama.burnFrom(address(this), transferred);

        _debtClear[msg.sender] -= clearAmount;
        _debtEncrypted[msg.sender] = _decreaseEncrypted(_debtEncrypted[msg.sender], transferred, msg.sender);

        emit Repaid(msg.sender, clearAmount);
    }

    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        uint256 clearAmount
    ) external {
        if (clearAmount == 0 || clearAmount > _stakedEth[msg.sender]) {
            revert InvalidAmount();
        }

        uint256 remainingStake = _stakedEth[msg.sender] - clearAmount;
        if (remainingStake < _debtClear[msg.sender]) {
            revert InsufficientStake();
        }

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(amount);

        _stakedEth[msg.sender] = remainingStake;
        _stakedEncrypted[msg.sender] = _decreaseEncrypted(_stakedEncrypted[msg.sender], amount, msg.sender);

        (bool success, ) = msg.sender.call{value: clearAmount}("");
        if (!success) {
            revert TransferFailed();
        }

        emit Withdrawn(msg.sender, clearAmount);
    }

    function getEncryptedStake(address account) external view returns (euint64) {
        return _stakedEncrypted[account];
    }

    function getEncryptedDebt(address account) external view returns (euint64) {
        return _debtEncrypted[account];
    }

    function getAccountSnapshot(address account) external view returns (uint256 stakedEth, uint256 debtClear) {
        return (_stakedEth[account], _debtClear[account]);
    }

    function _increaseEncrypted(euint64 current, euint64 delta, address account) internal returns (euint64 updated) {
        (, updated) = FHESafeMath.tryIncrease(current, delta);
        _allowAccess(account, updated);
    }

    function _decreaseEncrypted(euint64 current, euint64 delta, address account) internal returns (euint64 updated) {
        (, updated) = FHESafeMath.tryDecrease(current, delta);
        _allowAccess(account, updated);
    }

    function _allowAccess(address account, euint64 value) internal {
        FHE.allowThis(value);
        FHE.allow(value, account);
    }
}

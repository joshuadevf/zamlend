// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialZama is ERC7984, ZamaEthereumConfig {
    address public owner;
    address public minter;

    error Unauthorized();
    error InvalidAddress();

    constructor() ERC7984("cZama", "cZama", "") {
        owner = msg.sender;
        minter = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) {
            revert Unauthorized();
        }
        _;
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) {
            revert InvalidAddress();
        }
        minter = newMinter;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidAddress();
        }
        owner = newOwner;
    }

    function mint(address to, euint64 amount) external onlyMinter returns (euint64) {
        return _mint(to, amount);
    }

    function mintExternal(address to, externalEuint64 amount, bytes calldata inputProof) external onlyMinter returns (euint64) {
        euint64 encryptedAmount = FHE.fromExternal(amount, inputProof);
        return _mint(to, encryptedAmount);
    }

    function burnFrom(address from, euint64 amount) external onlyMinter returns (euint64) {
        if (!FHE.isAllowed(amount, msg.sender)) {
            revert Unauthorized();
        }
        return _burn(from, amount);
    }
}

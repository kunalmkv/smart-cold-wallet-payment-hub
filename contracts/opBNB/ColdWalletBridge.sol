// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ColdWalletBridge
 * @dev Bridge contract that locks BNB on opBNB and coordinates with the sidechain
 * for minting equivalent wOpBNB tokens there.
 */
contract ColdWalletBridge is AccessControl, Pausable {
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");

    // Mapping to track locked funds by user
    mapping(address => uint256) public lockedFunds;
    // Mapping to track bridge operations to prevent replay attacks
    mapping(bytes32 => bool) public processedOperations;

    // Events for bridge operations
    event FundsLocked(address indexed user, uint256 amount, bytes32 operationId);
    event FundsUnlocked(address indexed user, uint256 amount, bytes32 operationId);

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(BRIDGE_OPERATOR_ROLE, msg.sender);
    }

    /**
     * @dev Locks BNB in the bridge contract and emits an event for the sidechain to mint wOpBNB
     * @param operationId A unique identifier for this bridge operation
     */
    function lockFunds(bytes32 operationId) external payable whenNotPaused {
        require(msg.value > 0, "Must lock some funds");
        require(!processedOperations[operationId], "Operation already processed");

        lockedFunds[msg.sender] += msg.value;
        processedOperations[operationId] = true;

        emit FundsLocked(msg.sender, msg.value, operationId);
    }

    /**
     * @dev Unlocks BNB based on a burn event from the sidechain
     * @param user The address to send unlocked funds to
     * @param amount The amount to unlock
     * @param operationId A unique identifier for this bridge operation
     * @param signature The signature from the bridge operators verifying this operation
     */
    function unlockFunds(
        address payable user,
        uint256 amount,
        bytes32 operationId,
        bytes calldata signature
    ) external whenNotPaused onlyRole(BRIDGE_OPERATOR_ROLE) {
        require(!processedOperations[operationId], "Operation already processed");
        require(lockedFunds[user] >= amount, "Insufficient locked funds");

        // Verify signature (simplified for brevity)
        // In a real implementation, we would carefully validate the signature
        // against multiple bridge operators

        lockedFunds[user] -= amount;
        processedOperations[operationId] = true;

        user.transfer(amount);

        emit FundsUnlocked(user, amount, operationId);
    }

    /**
     * @dev Pauses the bridge in case of emergency
     */
    function pauseBridge() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses the bridge
     */
    function unpauseBridge() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}

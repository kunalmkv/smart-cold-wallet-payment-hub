// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title SpendingPolicyManager
 * @dev Manages spending policies for cold wallets on opBNB
 * These policies are then enforced on the sidechain
 */
contract SpendingPolicyManager is Ownable, Pausable {
    struct SpendingPolicy {
        uint256 dailyLimit;
        address[] whitelistedRecipients;
        bool requiresMultiSig;
        address[] approvers;
        uint256 requiredApprovals;
        uint256 lastUpdate;
        bool active;
    }

    // Mapping from cold wallet address to its spending policy
    mapping(address => SpendingPolicy) public policies;
    // Mapping from cold wallet to delegate hot wallet
    mapping(address => address) public delegates;

    // Events
    event PolicyCreated(address indexed coldWallet, address indexed delegate);
    event PolicyUpdated(address indexed coldWallet);
    event DelegateChanged(address indexed coldWallet, address indexed newDelegate);
    event PolicyRevoked(address indexed coldWallet);

    /**
     * @dev Create a new spending policy for a cold wallet
     * @param delegate The hot wallet address that will be authorized to spend
     * @param dailyLimit Maximum amount that can be spent per day
     * @param whitelistedRecipients Allowed recipient addresses (empty array for any)
     * @param requiresMultiSig Whether multiple signatures are required for transactions
     * @param approvers Addresses that can approve transactions if multiSig is enabled
     * @param requiredApprovals Number of approvals needed for a transaction
     */
    function createPolicy(
        address delegate,
        uint256 dailyLimit,
        address[] calldata whitelistedRecipients,
        bool requiresMultiSig,
        address[] calldata approvers,
        uint256 requiredApprovals
    ) external whenNotPaused {
        require(delegate != address(0), "Invalid delegate address");
        require(!policies[msg.sender].active, "Policy already exists");

        if (requiresMultiSig) {
            require(approvers.length >= requiredApprovals, "Not enough approvers");
            require(requiredApprovals > 0, "Required approvals must be > 0");
        }

        SpendingPolicy storage policy = policies[msg.sender];
        policy.dailyLimit = dailyLimit;
        policy.whitelistedRecipients = whitelistedRecipients;
        policy.requiresMultiSig = requiresMultiSig;
        policy.approvers = approvers;
        policy.requiredApprovals = requiredApprovals;
        policy.lastUpdate = block.timestamp;
        policy.active = true;

        delegates[msg.sender] = delegate;

        emit PolicyCreated(msg.sender, delegate);
    }

    /**
     * @dev Update an existing spending policy
     * @param dailyLimit New maximum amount that can be spent per day
     * @param whitelistedRecipients New allowed recipient addresses
     * @param requiresMultiSig Whether multiple signatures are required for transactions
     * @param approvers New addresses that can approve transactions
     * @param requiredApprovals New number of approvals needed
     */
    function updatePolicy(
        uint256 dailyLimit,
        address[] calldata whitelistedRecipients,
        bool requiresMultiSig,
        address[] calldata approvers,
        uint256 requiredApprovals
    ) external whenNotPaused {
        require(policies[msg.sender].active, "No active policy");

        if (requiresMultiSig) {
            require(approvers.length >= requiredApprovals, "Not enough approvers");
            require(requiredApprovals > 0, "Required approvals must be > 0");
        }

        SpendingPolicy storage policy = policies[msg.sender];
        policy.dailyLimit = dailyLimit;
        policy.whitelistedRecipients = whitelistedRecipients;
        policy.requiresMultiSig = requiresMultiSig;
        policy.approvers = approvers;
        policy.requiredApprovals = requiredApprovals;
        policy.lastUpdate = block.timestamp;

        emit PolicyUpdated(msg.sender);
    }

    /**
     * @dev Revoke the spending policy, removing delegation
     */
    function revokePolicy() external {
        require(policies[msg.sender].active, "No active policy");

        delete delegates[msg.sender];
        policies[msg.sender].active = false;
        policies[msg.sender].lastUpdate = block.timestamp;

        emit PolicyRevoked(msg.sender);
    }
}

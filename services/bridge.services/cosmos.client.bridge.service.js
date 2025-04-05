// bridge-service.js

const { ethers } = require('ethers');
const cosmos = require('@cosmjs/stargate');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

// Load environment variables
require('dotenv').config();

// Parse JSON request body
app.use(bodyParser.json());

// Contract ABIs and addresses
const BRIDGE_CONTRACT_ABI = require('./abi/ColdWalletBridge.json');
const POLICY_CONTRACT_ABI = require('./abi/SpendingPolicyManager.json');
const BRIDGE_CONTRACT_ADDRESS = process.env.BRIDGE_CONTRACT_ADDRESS;
const POLICY_CONTRACT_ADDRESS = process.env.POLICY_CONTRACT_ADDRESS;

// Ethereum provider for opBNB
const opBnbProvider = new ethers.providers.JsonRpcProvider(process.env.OPBNB_RPC_URL);
const opBnbWallet = new ethers.Wallet(process.env.BRIDGE_OPERATOR_PRIVATE_KEY, opBnbProvider);
const bridgeContract = new ethers.Contract(BRIDGE_CONTRACT_ADDRESS, BRIDGE_CONTRACT_ABI, opBnbWallet);
const policyContract = new ethers.Contract(POLICY_CONTRACT_ADDRESS, POLICY_CONTRACT_ABI, opBnbWallet);

// Cosmos sidechain connection
let cosmosClient;

/**
 * Initialize the Cosmos client
 */
async function initCosmosClient() {
    cosmosClient = await cosmos.SigningStargateClient.connectWithSigner(
        process.env.COSMOS_RPC_URL,
        await cosmos.DirectSecp256k1HdWallet.fromMnemonic(
            process.env.COSMOS_MNEMONIC,
            { prefix: process.env.COSMOS_PREFIX }
        )
    );
    console.log('Connected to Cosmos sidechain');
}

/**
 * Listen for FundsLocked events on opBNB and mint tokens on the sidechain
 */
async function listenForLockedFunds() {
    bridgeContract.on('FundsLocked', async (user, amount, operationId, event) => {
        console.log(`Funds locked: ${amount} BNB from ${user}`);

        try {
            // Convert the Ethereum address to a Cosmos address
            const cosmosAddress = ethAddressToCosmosAddress(user);

            // Create and broadcast a transaction to mint wOpBNB on the sidechain
            const mintMsg = {
                typeUrl: '/coldwallet.bridge.MsgMintTokens',
                value: {
                    toAddress: cosmosAddress,
                    amount: amount.toString(),
                    operationId: operationId
                }
            };

            const fee = {
                amount: [{ denom: 'uatom', amount: '5000' }],
                gas: '200000'
            };

            const result = await cosmosClient.signAndBroadcast(
                process.env.COSMOS_BRIDGE_ADDRESS,
                [mintMsg],
                fee
            );

            if (result.code === 0) {
                console.log(`Successfully minted ${amount} wOpBNB on sidechain for ${cosmosAddress}`);
            } else {
                console.error(`Error minting tokens: ${result.rawLog}`);
            }
        } catch (error) {
            console.error('Error processing lock event:', error);
        }
    });

    console.log('Listening for FundsLocked events on opBNB');
}

/**
 * Listen for policy changes on opBNB and sync them to the sidechain
 */
async function listenForPolicyChanges() {
    policyContract.on('PolicyCreated', async (coldWallet, delegate, event) => {
        console.log(`New policy created for ${coldWallet} with delegate ${delegate}`);

        try {
            // Get the full policy details
            const policy = await policyContract.getPolicy(coldWallet);

            // Sync the policy to the sidechain
            await syncPolicyToSidechain(coldWallet, policy, delegate);
        } catch (error) {
            console.error('Error processing policy creation:', error);
        }
    });

    console.log('Listening for policy changes on opBNB');
}

/**
 * Start the bridge service
 */
async function startBridgeService() {
    try {
        // Initialize Cosmos client
        await initCosmosClient();

        // Start listening for events on opBNB
        await listenForLockedFunds();
        await listenForPolicyChanges();

        console.log('Bridge service started successfully');
    } catch (error) {
        console.error('Error starting bridge service:', error);
        process.exit(1);
    }
}

// Start the bridge service and API server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bridge API server listening on port ${PORT}`);
    startBridgeService();
});

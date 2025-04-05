// delegate-wallet-service.js

const { ethers } = require('ethers');
const cosmos = require('@cosmjs/stargate');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Load environment variables
require('dotenv').config();

// Parse JSON request body
app.use(bodyParser.json());

// Connect to Cosmos sidechain
let cosmosClient;
let delegateAddress;

/**
 * Initialize the Cosmos client
 */
async function initCosmosClient() {
    const wallet = await cosmos.DirectSecp256k1HdWallet.fromMnemonic(
        process.env.DELEGATE_WALLET_MNEMONIC,
        { prefix: process.env.COSMOS_PREFIX }
    );

    cosmosClient = await cosmos.SigningStargateClient.connectWithSigner(
        process.env.COSMOS_RPC_URL,
        wallet
    );

    const accounts = await wallet.getAccounts();
    delegateAddress = accounts[0].address;

    console.log(`Connected to Cosmos sidechain with delegate address: ${delegateAddress}`);
}

/**
 * Execute a spending transaction on behalf of a cold wallet
 * @param {string} coldWalletAddress The cold wallet address (Cosmos format)
 * @param {string} recipientAddress The recipient address (Cosmos format)
 * @param {string} amount The amount to send
 * @param {Array<string>} signatures Signatures from approvers if required
 * @returns {Promise<object>} The transaction result
 */
async function executeSpending(coldWalletAddress, recipientAddress, amount, signatures = []) {
    // Create the spending execution message
    const spendMsg = {
        typeUrl: '/coldwallet.spending.MsgExecuteSpending',
        value: {
            coldWallet: coldWalletAddress,
            delegate: delegateAddress,
            recipient: recipientAddress,
            amount: amount,
            signatures: signatures || []
        }
    };

    const fee = {
        amount: [{ denom: 'uatom', amount: '5000' }],
        gas: '200000'
    };

    try {
        // Sign and broadcast the transaction
        const result = await cosmosClient.signAndBroadcast(
            delegateAddress,
            [spendMsg],
            fee
        );

        if (result.code === 0) {
            console.log(`Successfully executed spending of ${amount} from ${coldWalletAddress} to ${recipientAddress}`);
            return {
                success: true,
                transactionHash: result.transactionHash,
                gasUsed: result.gasUsed
            };
        } else {
            console.error(`Error executing spending: ${result.rawLog}`);
            return {
                success: false,
                error: result.rawLog
            };
        }
    } catch (error) {
        console.error('Error executing spending transaction:', error);
        throw error;
    }
}

// API endpoints for delegate wallet operations
app.post('/spend', async (req, res) => {
    try {
        const { coldWallet, recipient, amount, signatures } = req.body;

        if (!coldWallet || !recipient || !amount) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Check if the amount is valid
        if (isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Execute the spending
        const result = await executeSpending(coldWallet, recipient, amount, signatures);
        res.json(result);
    } catch (error) {
        console.error('Error processing spend request:', error);
        res.status(500).json({ error: 'Error processing spend request' });
    }
});

// Start the delegate wallet service
const PORT = process.env.DELEGATE_SERVICE_PORT || 3001;

initCosmosClient().then(() => {
    app.listen(PORT, () => {
        console.log(`Delegate wallet service listening on port ${PORT}`);
    });
}).catch(error => {
    console.error('Failed to initialize Cosmos client:', error);
    process.exit(1);
});

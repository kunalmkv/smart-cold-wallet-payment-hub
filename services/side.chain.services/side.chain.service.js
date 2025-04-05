// sidechainTx.js
require('dotenv').config();
const { DirectSecp256k1HdWallet, SigningStargateClient } = require('@cosmjs/stargate');

const rpcEndpoint = process.env.RPC_ENDPOINT;
const mnemonic = process.env.HOT_WALLET_MNEMONIC;

async function sendTransaction(recipient, amount) {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic);
    const [firstAccount] = await wallet.getAccounts();

    const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet);

    const result = await client.sendTokens(
        firstAccount.address,
        recipient,
        [{ denom: "wopbnb", amount: amount }],
        { amount: [{ denom: "wopbnb", amount: "1000" }], gas: "200000" }
    );

    console.log(result);
}

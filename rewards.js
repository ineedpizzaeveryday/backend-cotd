import dotenv from 'dotenv';
dotenv.config();
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import express from 'express';
import bs58 from 'bs58';

// Sprawdzanie, czy zmienne środowiskowe zostały załadowane poprawnie
console.log("Loaded environment variables:");
console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);

const router = express.Router();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');


const rewardAmount = 0.05 * 1_000_000_000; // 0.05 SOL

const privateKeyBase58 = process.env.REWARD_WALLET_PRIVATE_KEY;

if (!privateKeyBase58) {
    throw new Error("REWARD_WALLET_PRIVATE_KEY is not set in environment variables.");
}

// Logowanie klucza prywatnego po załadowaniu zmiennej środowiskowej
console.log("Private Key Loaded.");

// Tworzenie obiektu Keypair na podstawie klucza prywatnego
const senderKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

// Funkcja do logowania salda
const logSenderBalance = async () => {
    try {
        const senderBalance = await connection.getBalance(senderKeypair.publicKey);
        console.log('Sender Balance:', senderBalance);
        console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);

    } catch (error) {
        console.error("Error fetching sender balance:", error);
    }
};

// Logowanie publicznego klucza nadawcy
console.log("Sender Public Key:", senderKeypair.publicKey.toBase58());

// Logowanie salda
logSenderBalance();

// Endpoint wypłaty nagrody
router.post('/lottery/payout', async (req, res) => {
    const { winnerAddress } = req.body;

    if (!winnerAddress) {
        return res.status(400).json({ success: false, message: 'Winner address is required' });
    }

    try {
        const recipientPublicKey = new PublicKey(winnerAddress);

        // Pobranie blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        console.log("Blockhash:", blockhash);
        console.log("Last valid block height:", lastValidBlockHeight);

        // Tworzenie transakcji
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: senderKeypair.publicKey,
                toPubkey: recipientPublicKey,
                lamports: rewardAmount,
            })
        );

        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderKeypair.publicKey;
        transaction.sign(senderKeypair);

        // Wysyłanie transakcji
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
        });
        console.log("Transaction Signature:", signature);

        // Potwierdzenie transakcji
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log('Reward sent successfully. TxID:', signature);

        res.json({ success: true, txid: signature });
    } catch (error) {
        console.error('Error sending reward:', error);
        res.status(500).json({ success: false, message: 'Failed to send reward' });
    }
});

export default router;

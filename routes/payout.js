import express from 'express';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

const PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY; // 64-byte secret key jako string, np. z .env
const senderKeypair = Uint8Array.from(JSON.parse(PRIVATE_KEY));
const web3 = require('@solana/web3.js');
const sender = web3.Keypair.fromSecretKey(senderKeypair);

router.post('/payout', async (req, res) => {
  const { winnerAddress } = req.body;
  if (!winnerAddress) return res.status(400).json({ success: false, error: 'Missing winnerAddress' });

  try {
    const recipient = new PublicKey(winnerAddress);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: recipient,
        lamports: 0.05 * 1_000_000_000, // 0.05 SOL
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = sender.publicKey;

    const txid = await connection.sendTransaction(transaction, [sender]);
    await connection.confirmTransaction(txid, 'confirmed');

    res.json({ success: true, txid });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ success: false, error: err.message || 'Transaction failed' });
  }
});

export default router;

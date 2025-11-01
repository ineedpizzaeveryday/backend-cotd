import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import { getDecryptedKeypair } from "./secureKey.js";

const senderKeypair = getDecryptedKeypair();

console.log("✅ Reward wallet decrypted successfully.");
console.log("💼 Sender Public Key:", senderKeypair.publicKey.toBase58());

// ================== CONFIG LOGS ==================
console.log("===========================================");
console.log("🔧 Loaded environment variables:");
console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);
console.log("PORT:", process.env.PORT);
console.log("===========================================");

// ================== CONNECTION ==================
const router = express.Router();
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// ================== REWARD WALLET ==================
const rewardAmountLamports = 0.05 * 1_000_000_000; // 0.05 SOL



// ================== BALANCE CHECK ==================
const logSenderBalance = async () => {
  try {
    const balance = await connection.getBalance(senderKeypair.publicKey);
    console.log("💰 Sender Balance:", balance / 1e9, "SOL");
  } catch (error) {
    console.error("❌ Error fetching sender balance:", error);
  }
};

logSenderBalance();

// ================== PAYOUT ENDPOINT ==================
router.post('/lottery/payout', async (req, res) => {
  const { winnerAddress } = req.body;
  console.log("🔹 Received payout request for:", winnerAddress);

  try {
    if (!winnerAddress) {
      console.error("❌ Missing winnerAddress in request!");
      return res.status(400).json({ error: 'Missing winnerAddress' });
    }

    // Double-check connection
    const conn = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );

    // Check sender balance
    const balance = await conn.getBalance(senderKeypair.publicKey);
    console.log("💰 Current sender balance:", balance / 1e9, "SOL");

    if (balance < rewardAmountLamports) {
      console.error("❌ Not enough funds in reward wallet!");
      return res.status(500).json({ error: 'Insufficient funds in reward wallet' });
    }

    // Create transaction
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: new PublicKey(winnerAddress),
        lamports: rewardAmountLamports,
      })
    );

    console.log("📦 Sending transaction of", rewardAmountLamports / 1e9, "SOL...");
    const signature = await sendAndConfirmTransaction(conn, tx, [senderKeypair]);
    console.log("✅ Reward sent successfully! Signature:", signature);

    res.json({ success: true, signature });
  } catch (err) {
    console.error("❌ Error during payout process:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ================== EXPORT ==================
export default router;

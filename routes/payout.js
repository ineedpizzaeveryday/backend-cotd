// src/backend/routes/payout.js
import express from 'express';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

router.post('/payout', async (req, res) => {
  try {
    const { recipient } = req.body;

    if (!recipient) {
      return res.status(400).json({ error: 'Brak adresu odbiorcy.' });
    }

    const secretKeyBase58 = process.env.REWARD_WALLET_PRIVATE_KEY;
    if (!secretKeyBase58) {
      return res.status(500).json({ error: 'Brak klucza prywatnego w .env.' });
    }

    // 🔐 konwersja z base58
    const secretKey = bs58.decode(secretKeyBase58);
    const sender = Keypair.fromSecretKey(secretKey);

    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
    const recipientPubKey = new PublicKey(recipient);

    // 🔸 Tworzymy transakcję wysyłającą 0.05 SOL
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: recipientPubKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [sender]);

    console.log(`💸 Wysłano 0.05 SOL do ${recipientPubKey.toBase58()} | tx: ${signature}`);

    res.json({
      success: true,
      tx: signature,
      message: `Wysłano 0.05 SOL do ${recipientPubKey.toBase58()}`,
    });
  } catch (err) {
    console.error('❌ Błąd payout:', err);
    res.status(500).json({ error: 'Nie udało się wysłać SOL', details: err.message });
  }
});

export default router;

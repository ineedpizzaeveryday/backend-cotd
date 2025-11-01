// src/backend/routes/payout.js
import express from "express";
import { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

import { getDecryptedKeypair } from "../secureKey.js";

const payerKeypair = getDecryptedKeypair();
const router = express.Router();

router.post("/payout", async (req, res) => {
  try {
    const { recipient } = req.body;
    if (!recipient) {
      return res.status(400).json({ error: "Brak adresu odbiorcy." });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    const recipientPubKey = new PublicKey(recipient);
    const amountLamports = 0.05 * LAMPORTS_PER_SOL;

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: recipientPubKey,
        lamports: amountLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [payerKeypair]);

    console.log(`💸 Wysłano 0.05 SOL do ${recipientPubKey.toBase58()} | tx: ${signature}`);

    res.json({
      success: true,
      tx: signature,
      message: `Wysłano 0.05 SOL do ${recipientPubKey.toBase58()}`,
    });
  } catch (err) {
    console.error("❌ Błąd payout:", err);
    res.status(500).json({ error: "Nie udało się wysłać SOL", details: err.message });
  }
});

export default router;

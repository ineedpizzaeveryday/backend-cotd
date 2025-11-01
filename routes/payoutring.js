// src/backend/routes/payoutring.js
import express from "express";
import {Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL} from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

import { getDecryptedKeypair } from "../secureKey.js";

const router = express.Router();
const payerKeypair = getDecryptedKeypair();

router.post("/ring/payout", async (req, res) => {
  try {
    const { winnerAddress } = req.body;
    if (!winnerAddress) {
      return res.status(400).json({ success: false, error: "Brak adresu zwycięzcy." });
    }

    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
    const recipient = new PublicKey(winnerAddress);

    // 💰 Inna kwota niż w payout.js — np. 0.02 SOL
    const amountLamports = 0.02 * LAMPORTS_PER_SOL;

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: recipient,
        lamports: amountLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [payerKeypair]);

    console.log(`💸 Ring Payout: Wysłano 0.02 SOL do ${recipient.toBase58()} | tx: ${signature}`);

    res.json({
      success: true,
      txid: signature,
      message: `Ring Payout: Wysłano 0.02 SOL do ${recipient.toBase58()}`,
    });
  } catch (err) {
    console.error("❌ Błąd Ring Payout:", err);
    res.status(500).json({
      success: false,
      error: "Nie udało się wysłać nagrody w Ring.",
      details: err.message,
    });
  }
});

export default router;

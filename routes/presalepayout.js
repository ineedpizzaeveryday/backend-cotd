// src/backend/routes/presalepayout.js
import express from "express";
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";
dotenv.config();

import { getDecryptedKeypair } from "../secureKey.js";

const router = express.Router();
const payerKeypair = getDecryptedKeypair();

// Adres tokena MNT (później możesz go podać w .env)
const MNT_TOKEN_MINT = new PublicKey(process.env.MNT_TOKEN_MINT);
// Przelicznik: 1 SOL = 1000 tokenów
const TOKENS_PER_SOL = 1000;

router.post("/presale/payout", async (req, res) => {
  try {
    const { winnerAddress, amountSOL } = req.body;

    if (!winnerAddress || !amountSOL) {
      return res.status(400).json({
        success: false,
        error: "Brak adresu lub ilości SOL.",
      });
    }

    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    const recipientPubkey = new PublicKey(winnerAddress);

    // 🔹 Przelicz ile tokenów wysłać
    const tokenAmount = amountSOL * TOKENS_PER_SOL * 1_000_000; // zakładamy 6 miejsc po przecinku

    // Znajdź konto tokenowe odbiorcy
    const recipientATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      recipientPubkey
    );

    // Znajdź konto tokenowe nadawcy
    const senderATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      payerKeypair.publicKey
    );

    // Stwórz transakcję wysyłającą tokeny MNT
    const tx = new Transaction().add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        payerKeypair.publicKey,
        tokenAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [payerKeypair]);

    console.log(
      `💰 Presale payout: wysłano ${tokenAmount / 1_000_000} MNT do ${winnerAddress} (tx: ${signature})`
    );

    res.json({
      success: true,
      txid: signature,
      tokensSent: tokenAmount / 1_000_000,
      message: `Wysłano ${tokenAmount / 1_000_000} MNT tokenów.`,
    });
  } catch (err) {
    console.error("❌ Błąd presale payout:", err);
    res.status(500).json({
      success: false,
      error: "Nie udało się wysłać tokenów MNT.",
      details: err.message,
    });
  }
});

export default router;

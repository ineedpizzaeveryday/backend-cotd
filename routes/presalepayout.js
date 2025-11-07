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

// 🔹 Token mint — możesz ustawić w .env lub zostawić stały
const MNT_TOKEN_MINT = new PublicKey(
  process.env.MNT_TOKEN_MINT || "B6QymiRTta3a8hPKGWsUujmwjqmHjALSnN213HM5EM1E"
);

// 🔹 Przelicznik: 1 SOL = 100 tokenów
const TOKENS_PER_SOL = 100;

router.post("/payout", async (req, res) => {
  try {
    const { wallet, solAmount } = req.body; // dopasowane do frontendu

    if (!wallet || !solAmount) {
      return res.status(400).json({
        success: false,
        error: "Brak adresu portfela lub ilości SOL.",
      });
    }

    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    const recipientPubkey = new PublicKey(wallet);

    // 🔹 Przelicz ilość tokenów (6 miejsc po przecinku)
    const tokenAmount = solAmount * TOKENS_PER_SOL * 1_000_000;

    // Pobierz adresy kont tokenowych (ATA)
    const recipientATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      recipientPubkey
    );

    const senderATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      payerKeypair.publicKey
    );

    // 🔹 Stwórz i podpisz transakcję
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

    const signature = await sendAndConfirmTransaction(connection, tx, [
      payerKeypair,
    ]);

    console.log(
      `💰 Presale payout: wysłano ${tokenAmount / 1_000_000} MNT do ${wallet} (tx: ${signature})`
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

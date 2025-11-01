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
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";
dotenv.config();

import { getDecryptedKeypair } from "../secureKey.js";

const router = express.Router();
const payerKeypair = getDecryptedKeypair();

// 🔹 Adres tokena MNT (z .env)
const MNT_TOKEN_MINT = new PublicKey(process.env.MNT_TOKEN_MINT);
// 🔹 Przelicznik: 1 SOL = 1000 tokenów
const TOKENS_PER_SOL = 1000;

router.post("/presale/payout", async (req, res) => {
  try {
    const { winnerAddress, amountSOL } = req.body;

    if (!winnerAddress || !amountSOL || isNaN(amountSOL) || amountSOL <= 0) {
      return res.status(400).json({
        success: false,
        error: "Niepoprawne dane wejściowe (adres lub ilość SOL).",
      });
    }

    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    const recipientPubkey = new PublicKey(winnerAddress);

    // 🔹 Przelicz ilość tokenów
    const tokenAmount = amountSOL * TOKENS_PER_SOL * 1_000_000; // 6 decimal

    console.log(
      `➡️ Presale payout: ${amountSOL} SOL → ${tokenAmount / 1_000_000} MNT dla ${winnerAddress}`
    );

    // 🔹 Upewnij się, że oba konta ATA istnieją (jeśli nie, utworzy)
    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      payerKeypair,
      MNT_TOKEN_MINT,
      payerKeypair.publicKey
    );

    const recipientATA = await getOrCreateAssociatedTokenAccount(
      connection,
      payerKeypair,
      MNT_TOKEN_MINT,
      recipientPubkey
    );

    // 🔹 Stwórz transakcję
    const tx = new Transaction().add(
      createTransferInstruction(
        senderATA.address,
        recipientATA.address,
        payerKeypair.publicKey,
        tokenAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // 🔹 Wyślij transakcję
    const signature = await sendAndConfirmTransaction(connection, tx, [payerKeypair]);

    console.log(
      `✅ Presale payout zakończony: ${tokenAmount / 1_000_000} MNT → ${winnerAddress} (tx: ${signature})`
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

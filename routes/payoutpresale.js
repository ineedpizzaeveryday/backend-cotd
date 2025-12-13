// routes/payoutpresale.js
import express from "express";
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

import { keypair } from "../server.js"; // gotowy keypair z server.js

const router = express.Router();

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

const MNT_TOKEN_MINT = new PublicKey(
  process.env.MNT_TOKEN_MINT || "B6QymiRTta3a8hPKGWsUujmwjqmHjALSnN213HM5EM1E"
);
const TOKENS_PER_SOL = 100; // 1 SOL = 100 tokenów

router.post("/presale/payout", async (req, res) => {
  try {
    const { wallet, solAmount } = req.body;
    if (!wallet || !solAmount || solAmount <= 0) {
      return res.status(400).json({ success: false, error: "Nieprawidłowe dane" });
    }

    const recipientPubkey = new PublicKey(wallet);
    const tokenAmount = Math.floor(solAmount * TOKENS_PER_SOL * 1_000_000); // 6 decimals

    // ATA nadawcy (zawsze istnieje)
    const senderATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, keypair.publicKey);

    // ATA odbiorcy
    const recipientATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, recipientPubkey);

    const transaction = new Transaction();

    // Sprawdź czy ATA odbiorcy istnieje
    const accountInfo = await connection.getAccountInfo(recipientATA);
    if (!accountInfo) {
      console.log(`ATA nie istnieje dla ${wallet} – tworzę...`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,     // payer
          recipientATA,          // nowe ATA
          recipientPubkey,       // właściciel
          MNT_TOKEN_MINT         // mint
        )
      );
    }

    // Transfer tokenów
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        keypair.publicKey,
        tokenAmount
      )
    );

    // Wysyłka
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log(`Presale: ${tokenAmount / 1_000_000} MNT → ${wallet} | Tx: ${signature}`);

    res.json({
      success: true,
      txid: signature,
      tokensSent: tokenAmount / 1_000_000,
    });
  } catch (err) {
    console.error("Błąd presale payout:", err.message);
    res.status(500).json({
      success: false,
      error: "Nie udało się wysłać tokenów",
      details: err.message,
    });
  }
});

export default router;
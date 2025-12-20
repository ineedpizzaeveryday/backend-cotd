// routes/payoutpresale.js – z pełnymi logami
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

import { keypair } from "../server.js";

const router = express.Router();

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://rpc.hellomoon.io",
  "confirmed"
);

const MNT_TOKEN_MINT = new PublicKey(
  process.env.MNT_TOKEN_MINT || "DWPLeuggJtGAJ4dGLXnH94653f1xGE1Nf9TVyyiR5U35" // Twój $INSTANT mint
);
const TOKENS_PER_SOL = 500000; // 1 SOL = 500 000 tokenów (dostosuj do ceny)

router.post("/", async (req, res) => {
  console.log("🎰 PRESALE PAYOUT – request received");
  console.log("Body:", req.body);

  const { wallet, solAmount } = req.body;

  if (!wallet || !solAmount || solAmount <= 0) {
    console.log("❌ Brak danych – wallet lub solAmount");
    return res.status(400).json({ success: false, error: "Brak wallet lub solAmount" });
  }

  let recipientPubkey;
  try {
    recipientPubkey = new PublicKey(wallet);
    console.log("✅ Odbiorca:", recipientPubkey.toBase58());
  } catch (err) {
    console.log("❌ Nieprawidłowy adres odbiorcy");
    return res.status(400).json({ success: false, error: "Nieprawidłowy adres Solana" });
  }

  const tokenAmount = Math.floor(solAmount * TOKENS_PER_SOL);

  console.log(`📤 Wysyłka: ${tokenAmount} tokenów za ${solAmount} SOL`);

  try {
    // ATA nadawcy (keypair – Twój reward wallet)
    const senderATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, keypair.publicKey);
    console.log("Sender ATA:", senderATA.toBase58());

    // ATA odbiorcy
    const recipientATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, recipientPubkey);
    console.log("Recipient ATA:", recipientATA.toBase58());

    const transaction = new Transaction();

    // Jeśli ATA odbiorcy nie istnieje – tworzymy
    const recipientATAInfo = await connection.getAccountInfo(recipientATA);
    if (!recipientATAInfo) {
      console.log("ATA odbiorcy nie istnieje – tworzymy");
      transaction.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          recipientATA,
          recipientPubkey,
          MNT_TOKEN_MINT
        )
      );
    }

    // Transfer tokenów
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        keypair.publicKey,
        BigInt(tokenAmount)
      )
    );

    console.log("📤 Wysyłanie transakcji...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log(`✅ Presale payout sukces! Tx: ${signature}`);

    res.json({
      success: true,
      txid: signature,
      tokensSent: tokenAmount,
    });
  } catch (err) {
    console.error("❌ Błąd payout:", err.message);
    if (err.message.includes("insufficient funds")) {
      return res.status(500).json({ success: false, error: "Brak tokenów w reward wallet" });
    }
    res.status(500).json({ success: false, error: "Błąd serwera", details: err.message });
  }
});

export default router;
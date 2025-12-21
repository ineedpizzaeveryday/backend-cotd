// routes/payoutpresale.js – wersja z fallback RPC, retry blockhash i logami
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

// Najlepsze darmowe RPC w 2025 – fallback w razie problemów
const RPC_URLS = [
  "https://mainnet.helius-rpc.com/?api-key=20197e39-1d7d-4b77-b6a5-6594c59b0b46",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo", // Alchemy public
  
];

let connection;

// Funkcja tworząca connection z fallback
const createConnection = () => {
  for (const url of RPC_URLS) {
    try {
      const conn = new Connection(url, "confirmed");
      console.log(`✅ Połączono z RPC: ${url}`);
      return conn;
    } catch (err) {
      console.warn(`RPC ${url} niedostępny – próbuję następny`);
    }
  }
  throw new Error("Wszystkie RPC niedostępne");
};

connection = createConnection();

// Mint $INSTANT – ZMIEŃ JEŚLI INNY
const MNT_TOKEN_MINT = new PublicKey("DWPLeuggJtGAJ4dGLXnH94653f1xGE1Nf9TVyyiR5U35");

// Cena presale – dostosuj
const TOKENS_PER_SOL = 500000; // 1 SOL = 500 000 tokenów

// Retry na blockhash (rozwiązuje 400 Bad Request)
const getBlockhashWithRetry = async (retries = 10) => {
  for (let i = 0; i < retries; i++) {
    try {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      return blockhash;
    } catch (err) {
      console.log(`Retry blockhash ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1))); // rosnące opóźnienie
    }
  }
  throw new Error("Nie udało się pobrać blockhash po retry");
};

router.post("/", async (req, res) => {
  console.log("🎰 PRESALE PAYOUT – request received");
  console.log("Body:", req.body);

  const { wallet, solAmount } = req.body;

  if (!wallet || !solAmount || solAmount <= 0) {
    console.log("❌ Brak danych");
    return res.status(400).json({ success: false, error: "Brak wallet lub solAmount" });
  }

  let recipientPubkey;
  try {
    recipientPubkey = new PublicKey(wallet);
    console.log("✅ Odbiorca:", recipientPubkey.toBase58());
  } catch {
    return res.status(400).json({ success: false, error: "Nieprawidłowy adres" });
  }

  const tokenAmount = Math.floor(solAmount * TOKENS_PER_SOL);
  console.log(`📤 Wysyłka: ${tokenAmount} tokenów za ${solAmount} SOL`);

  try {
    const senderATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, keypair.publicKey);
    const recipientATA = await getAssociatedTokenAddress(MNT_TOKEN_MINT, recipientPubkey);

    console.log("Sender ATA:", senderATA.toBase58());
    console.log("Recipient ATA:", recipientATA.toBase58());

    const transaction = new Transaction();

    // ZAWSZE create ATA – idempotentne, bezpieczne
    transaction.add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        recipientATA,
        recipientPubkey,
        MNT_TOKEN_MINT
      )
    );

    // Transfer
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        keypair.publicKey,
        BigInt(tokenAmount)
      )
    );

    // Pobieramy blockhash z retry
    const blockhash = await getBlockhashWithRetry();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    console.log("📤 Wysyłanie transakcji...");
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log(`✅ Presale payout SUKCES! Tx: ${signature}`);

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
    res.status(500).json({ success: false, error: "Payout failed", details: err.message });
  }
});

export default router;
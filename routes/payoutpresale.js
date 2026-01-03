// routes/payoutpresale.js – wersja finalna dla Token-2022 + Immutable Owner
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
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import { keypair } from "../server.js";

const router = express.Router();

// RPC fallback
const RPC_URLS = [
  "https://mainnet.helius-rpc.com/?api-key=20197e39-1d7d-4b77-b6a5-6594c59b0b46",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
];

 const publicConnection = new Connection(
    "https://rpc.ankr.com/solana", 
    "confirmed"
 );


let connection;

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

// Mint $INSTANT (Token-2022)
const MNT_TOKEN_MINT = new PublicKey("DWPLeuggJtGAJ4dGLXnH94653f1xGE1Nf9TVyyiR5U35");

// Phase 1 – poprawna cena
const TOKENS_PER_SOL = 1_176_470;

// Retry blockhash
const getBlockhashWithRetry = async (retries = 10) => {
  for (let i = 0; i < retries; i++) {
    try {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      return blockhash;
    } catch (err) {
      console.log(`Retry blockhash ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error("Nie udało się pobrać blockhash po retry");
};

router.post("/", async (req, res) => {
  console.log("🎰 PRESALE PAYOUT – request received");
  console.log("Body:", req.body);

  const { wallet, solAmount } = req.body;

  if (!wallet || !solAmount || solAmount <= 0) {
    return res.status(400).json({ success: false, error: "Brak wallet lub solAmount" });
  }

  let recipientPubkey;
  try {
    recipientPubkey = new PublicKey(wallet);
    console.log("✅ Odbiorca:", recipientPubkey.toBase58());
  } catch {
    return res.status(400).json({ success: false, error: "Nieprawidłowy adres" });
  }

  // Obliczamy tokeny
  const tokenAmount = Math.floor(solAmount * TOKENS_PER_SOL);

  // Log dopiero tutaj – po obliczeniu
  console.log(`📤 Wysyłka: ${tokenAmount.toLocaleString()} tokenów (${(tokenAmount / 1_000_000).toFixed(3)}M) za ${solAmount} SOL`);

  try {
    const senderATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      keypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const recipientATA = await getAssociatedTokenAddress(
      MNT_TOKEN_MINT,
      recipientPubkey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("Sender ATA:", senderATA.toBase58());
    console.log("Recipient ATA:", recipientATA.toBase58());

    const transaction = new Transaction();

    // Create ATA jeśli nie istnieje
    try {
      await getAccount(connection, recipientATA, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log("Recipient ATA już istnieje – pomijamy create");
    } catch (err) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          recipientATA,
          recipientPubkey,
          MNT_TOKEN_MINT,
          TOKEN_2022_PROGRAM_ID,
          undefined,
          true
        )
      );
      console.log("Dodano create ATA");
    }

    // Transfer
    transaction.add(
      createTransferInstruction(
        senderATA,
        recipientATA,
        keypair.publicKey,
        BigInt(tokenAmount),
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

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
    if (err.logs) console.error("Logs:", err.logs);

    res.status(500).json({
      success: false,
      error: "Payout failed",
      details: err.message,
    });
  }
});

export default router;
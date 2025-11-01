// src/backend/rewards.js
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction, 
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { getDecryptedKeypair } from './secureKey.js';



const router = express.Router();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');

const senderKeypair = getDecryptedKeypair();
console.log("✅ Reward wallet decrypted successfully.");
console.log("💼 Sender Public Key:", senderKeypair.publicKey.toBase58());

// ================== TOKEN CONFIG ==================
const TOKEN_MINT = new PublicKey('pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'); // Twój token PUMP
const TOKEN_DECIMALS = 6;
const REWARD_AMOUNT = 100; // np. 100 PUMP
const amountLamports = REWARD_AMOUNT * 10 ** TOKEN_DECIMALS;

// ================== BALANCE CHECK ==================
const logSenderBalance = async () => {
  try {
    const senderTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, senderKeypair.publicKey);
    const accountInfo = await connection.getTokenAccountBalance(senderTokenAccount);
    console.log("💰 Sender PUMP balance:", accountInfo.value.uiAmount, "PUMP");
  } catch (error) {
    console.error("❌ Error fetching sender token balance:", error);
  }
};

logSenderBalance();

// ================== PAYOUT ENDPOINT ==================
router.post('/lottery/payout', async (req, res) => {
  const { winnerAddress } = req.body;
  console.log("🔹 Received payout request for:", winnerAddress);

  try {
    if (!winnerAddress) {
      return res.status(400).json({ error: 'Missing winnerAddress' });
    }

    const recipient = new PublicKey(winnerAddress);

    // Konta tokenowe
    const senderTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, senderKeypair.publicKey);
    const recipientTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, recipient);

    // Sprawdzenie salda konta wysyłającego
    const senderAccountInfo = await connection.getTokenAccountBalance(senderTokenAccount);
    const senderBalance = senderAccountInfo.value.amount; // w najmniejszej jednostce tokena

    if (Number(senderBalance) < amountLamports) {
      console.error(`❌ Not enough PUMP to pay reward! Needed: ${REWARD_AMOUNT}, Available: ${senderBalance / 10 ** TOKEN_DECIMALS}`);
      return res.status(500).json({ error: 'Insufficient token balance in reward wallet' });
    }

    const instructions = [];

    // Sprawdzenie, czy konto odbiorcy istnieje
    const accountInfo = await connection.getAccountInfo(recipientTokenAccount);
    if (!accountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          senderKeypair.publicKey, // payer
          recipientTokenAccount,   // account to create
          recipient,               // owner
          TOKEN_MINT
        )
      );
      console.log("📦 Created associated token account for recipient.");
    }

    // Instrukcja transferu tokenów
    instructions.push(
      createTransferInstruction(
        senderTokenAccount,
        recipientTokenAccount,
        senderKeypair.publicKey,
        amountLamports
      )
    );

    const tx = new Transaction().add(...instructions);
    const signature = await sendAndConfirmTransaction(connection, tx, [senderKeypair]);

    console.log("✅ Reward sent successfully! Signature:", signature);
    res.json({ success: true, signature });

  } catch (err) {
    console.error("❌ Error during payout process:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;

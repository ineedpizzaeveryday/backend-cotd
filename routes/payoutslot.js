// routes/payout.js – wersja z logami i lepszymi błędami
import express from "express";
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { keypair } from "../server.js";

const router = express.Router();

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://rpc.hellomoon.io",
  "confirmed"
);

const REWARD_AMOUNT_SOL = 0.05;
const REWARD_AMOUNT_LAMPORTS = REWARD_AMOUNT_SOL * LAMPORTS_PER_SOL;

// Log salda przy starcie
(async () => {
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`💰 Reward wallet (${keypair.publicKey.toBase58()}) balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (err) {
    console.error("❌ Nie udało się sprawdzić salda reward wallet");
  }
})();

    router.post("/", async (req, res) => {
  const { winnerAddress } = req.body;

  console.log("🎰 Żądanie wypłaty dla:", winnerAddress);

  if (!winnerAddress) {
    return res.status(400).json({ success: false, error: "Brak adresu zwycięzcy" });
  }

  let recipientPubKey;
  try {
    recipientPubKey = new PublicKey(winnerAddress);
  } catch {
    return res.status(400).json({ success: false, error: "Nieprawidłowy adres Solana" });
  }

  try {
    // Sprawdź saldo
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Aktualne saldo reward wallet: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    if (balance < REWARD_AMOUNT_LAMPORTS + 0.001 * LAMPORTS_PER_SOL) { // + fee
      console.error("❌ Brak środków na wypłatę nagrody!");
      return res.status(500).json({ success: false, error: "No funds on reward wallet" });
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPubKey,
        lamports: REWARD_AMOUNT_LAMPORTS,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log(`✅ Wypłata 0.05 SOL do ${winnerAddress} | Tx: ${signature}`);

    res.json({ success: true, txid: signature });
  } catch (err) {
    console.error("❌ Błąd payout:", err.message);

    if (err.message.includes("insufficient funds")) {
      return res.status(500).json({ success: false, error: "No funds on reward wallet" });
    }

    res.status(500).json({ success: false, error: "Payout failed", details: err.message });
  }
});

export default router;
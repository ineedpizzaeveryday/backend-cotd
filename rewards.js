import dotenv from 'dotenv';
dotenv.config();
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import express from 'express';
import bs58 from 'bs58';

// Sprawdzanie, czy zmienne środowiskowe zostały załadowane poprawnie
console.log("Loaded environment variables:");
console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);




const router = express.Router();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');


const rewardAmount = 0.05 * 1_000_000_000; // 0.05 SOL

const privateKeyBase58 = process.env.REWARD_WALLET_PRIVATE_KEY;

if (!privateKeyBase58) {
    throw new Error("REWARD_WALLET_PRIVATE_KEY is not set in environment variables.");
}

// Logowanie klucza prywatnego po załadowaniu zmiennej środowiskowej
console.log("Private Key Loaded.");

// Tworzenie obiektu Keypair na podstawie klucza prywatnego
const senderKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

console.log("Received payout request for:", winnerAddress);


// Funkcja do logowania salda
const logSenderBalance = async () => {
    try {
        const senderBalance = await connection.getBalance(senderKeypair.publicKey);
        console.log('Sender Balance:', senderBalance);
        console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);

    } catch (error) {
        console.error("Error fetching sender balance:", error);
    }
};

// Logowanie publicznego klucza nadawcy
console.log("Sender Public Key:", senderKeypair.publicKey.toBase58());


// Logowanie salda
logSenderBalance();

// Endpoint wypłaty nagrody
router.post('/lottery/payout', async (req, res) => {
  const { winnerAddress } = req.body;
  console.log("🔹 Otrzymano żądanie payout dla:", winnerAddress);

  try {
    if (!winnerAddress) {
      console.error("❌ Brak adresu odbiorcy!");
      return res.status(400).json({ error: 'Missing winnerAddress' });
    }

    const privateKey = process.env.REWARD_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      console.error("❌ Brak klucza prywatnego w .env!");
      return res.status(500).json({ error: 'Private key missing' });
    }

    const secret = Uint8Array.from(JSON.parse(privateKey));
    const sender = Keypair.fromSecretKey(secret);
    console.log("✅ Załadowano klucz portfela nadawcy:", sender.publicKey.toBase58());

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const balance = await connection.getBalance(sender.publicKey);
    console.log("💰 Saldo portfela:", balance / 1e9, "SOL");

    if (balance < 0.05 * 1e9) {
      console.error("❌ Za mało środków w portfelu!");
      return res.status(500).json({ error: 'Insufficient funds in reward wallet' });
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: new PublicKey(winnerAddress),
        lamports: 0.05 * 1e9,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [sender]);
    console.log("✅ Wysłano nagrodę! Signature:", signature);

    res.json({ success: true, signature });
  } catch (err) {
    console.error("❌ Błąd podczas wysyłania nagrody:", err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});



export default router;

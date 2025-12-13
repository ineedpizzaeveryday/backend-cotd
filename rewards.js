// rewards.js
import express from 'express';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import { keypair } from './server.js'; // Import gotowego keypair z server.js

const router = express.Router();

// Jedno stałe połączenie – szybsze i bardziej niezawodne
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', // zmień na mainnet jeśli produkcja
  'confirmed'
);

const REWARD_AMOUNT_LAMPORTS = 0.05 * 1_000_000_000; // 0.05 SOL

// Logowanie salda przy starcie (opcjonalnie – możesz usunąć jeśli nie chcesz)
const logSenderBalance = async () => {
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('💰 Reward wallet balance:', (balance / 1e9).toFixed(4), 'SOL');
  } catch (error) {
    console.error('❌ Błąd sprawdzania salda reward wallet:', error.message);
  }
};

logSenderBalance();

// Walidacja adresu Solana
const isValidSolanaAddress = (address) => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// ================== ENDPOINT: Wypłata nagrody loteryjnej ==================
router.post('/lottery/payout', async (req, res) => {
  const { winnerAddress } = req.body;

  console.log('🎰 Żądanie wypłaty nagrody dla:', winnerAddress);

  if (!winnerAddress) {
    return res.status(400).json({ success: false, error: 'Brak adresu zwycięzcy' });
  }

  if (!isValidSolanaAddress(winnerAddress)) {
    return res.status(400).json({ success: false, error: 'Nieprawidłowy adres Solana' });
  }

  try {
    // Sprawdź saldo nadawcy
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance < REWARD_AMOUNT_LAMPORTS) {
      console.error('❌ Brak środków w portfelu nagród!');
      return res.status(500).json({ success: false, error: 'Niewystarczające środki w portfelu nagród' });
    }

    // Tworzenie transakcji
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(winnerAddress),
        lamports: REWARD_AMOUNT_LAMPORTS,
      })
    );

    console.log(`📤 Wysyłanie 0.05 SOL na ${winnerAddress}...`);

    // Wysyłanie i potwierdzenie
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);

    console.log('✅ Nagroda wypłacona! Signature:', signature);

    return res.json({
      success: true,
      signature,
      amount: 0.05,
      recipient: winnerAddress,
    });
  } catch (error) {
    console.error('❌ Błąd podczas wypłaty nagrody:', error.message);

    // Lepsze rozróżnienie błędów
    if (error.message.includes('insufficient funds')) {
      return res.status(500).json({ success: false, error: 'Niewystarczające środki' });
    }

    return res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas wypłaty',
      details: error.message,
    });
  }
});

export default router;
import express from 'express';
import { Connection, PublicKey, SystemProgram, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();


const connection = new Connection('https://api.devnet.solana.com', 'confirmed');


const secretKey = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
const serverWallet = Keypair.fromSecretKey(secretKey);


router.post('/payout', async (req, res) => {
  try {
    const { winnerAddress } = req.body;

    if (!winnerAddress) {
      return res.status(400).json({ success: false, error: 'Missing winnerAddress' });
    }

    const recipient = new PublicKey(winnerAddress);
    const lamports = 0.05 * 1_000_000_000; // 0.05 SOL

    const { blockhash } = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: serverWallet.publicKey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: serverWallet.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [serverWallet]);

    console.log(`✅ Sent 0.05 SOL to ${winnerAddress}, TxID: ${signature}`);

    res.json({ success: true, txid: signature });
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

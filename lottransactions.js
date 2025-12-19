// lottransactions.js – wersja MongoDB (działa na Render darmowy)
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Brak MONGODB_URI w env!");

const client = new MongoClient(uri);
let db;

client.connect().then(() => {
  db = client.db(); // domyślna baza z URI
  console.log("✅ Połączono z MongoDB lottery");
}).catch(err => {
  console.error("❌ Błąd połączenia MongoDB:", err);
});

const generateRandomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
};

export const addLotteryTransaction = async (req, res) => {
  const { signature, wallet } = req.body;
  if (!signature || !wallet) return res.status(400).json({ success: false, error: 'Brak danych' });

  try {
    const collection = db.collection('lottery_transactions');
    const existing = await collection.findOne({ signature });
    if (existing) return res.json({ success: true, code: existing.code });

    const code = generateRandomCode();
    await collection.insertOne({
      signature,
      wallet,
      code,
      timestamp: new Date()
    });

    console.log(`🎟 Nowy los: ${code} → ${wallet.slice(0,8)}...`);
    res.json({ success: true, code });
  } catch (err) {
    console.error('Błąd MongoDB add:', err);
    res.status(500).json({ success: false, error: 'DB error' });
  }
};

export const getLotteryTransactionCount = async (req, res) => {
  try {
    const collection = db.collection('lottery_transactions');
    const count = await collection.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error('Błąd MongoDB count:', err);
    res.status(500).json({ error: 'DB error' });
  }
};
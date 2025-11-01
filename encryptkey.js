import fs from "fs";
import path from "path";
import crypto from "crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const ENC_FILE = path.resolve("./encrypted_key.json");

// Hasło nie z repozytorium, w dev możesz podać ENV przy uruchomieniu
const PASSWORD = process.env.PRIVATE_KEY_PASSWORD;

if (!PASSWORD) throw new Error("❌ Brak PRIVATE_KEY_PASSWORD w środowisku.");

export function getDecryptedKeypair() {
  if (!fs.existsSync(ENC_FILE)) {
    throw new Error(`❌ Nie znaleziono pliku zaszyfrowanego klucza: ${ENC_FILE}`);
  }

  const raw = fs.readFileSync(ENC_FILE, "utf8");
  const obj = JSON.parse(raw);

  const salt = Buffer.from(obj.salt, "hex");
  const iv = Buffer.from(obj.iv, "hex");
  const tag = Buffer.from(obj.tag, "hex");
  const content = Buffer.from(obj.content, "hex");

  const key = crypto.scryptSync(PASSWORD, salt, 32, { N: 2 ** 17, r: 8, p: 1 });

  // Sprawdzenie HMAC przed odszyfrowaniem
  const hmacCheck = crypto.createHmac("sha256", key).update(content).digest("hex");
  if (hmacCheck !== obj.hmac) {
    throw new Error("❌ Integralność danych nie przeszła HMAC!");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  const base58Key = decrypted.toString("utf8").trim();

  const secretKey = bs58.decode(base58Key);
  return Keypair.fromSecretKey(secretKey);
}

// src/backend/secureKey.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const ENC_FILE = path.resolve("./encrypted_key.json");
const PASSWORD = process.env.PRIVATE_KEY_PASSWORD;

if (!PASSWORD) throw new Error("❌ Brak PRIVATE_KEY_PASSWORD w .env");


export function getDecryptedKeypair() {
  let encrypted;
  if (process.env.ENCRYPTED_KEY_JSON) {
    encrypted = JSON.parse(process.env.ENCRYPTED_KEY_JSON);
  } else {
    const ENC_FILE = "./src/encrypted_key.json";
    if (!fs.existsSync(ENC_FILE)) {
      throw new Error(`❌ Nie znaleziono pliku zaszyfrowanego klucza: ${ENC_FILE}`);
    }
    encrypted = JSON.parse(fs.readFileSync(ENC_FILE, "utf8"));
  }
  if (!fs.existsSync(ENC_FILE)) {
    throw new Error(`❌ Nie znaleziono pliku zaszyfrowanego klucza: ${ENC_FILE}`);
  }

  const raw = fs.readFileSync(ENC_FILE, "utf8");
  const obj = JSON.parse(raw);

  const salt = Buffer.from(obj.salt, "hex");
  const iv = Buffer.from(obj.iv, "hex");
  const tag = Buffer.from(obj.tag, "hex");
  const content = Buffer.from(obj.content, "hex");

  const key = crypto.scryptSync(PASSWORD, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  const base58Key = decrypted.toString("utf8").trim();

  const secretKey = bs58.decode(base58Key);
  return Keypair.fromSecretKey(secretKey);
}


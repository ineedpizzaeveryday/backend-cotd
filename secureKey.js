// src/backend/secureKey.js – WERSJA FINALNA, DZIAŁAJĄCA NA RENDER
import crypto from "crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const PASSWORD = process.env.PRIVATE_KEY_PASSWORD;
if (!PASSWORD) {
  console.error("❌ Brak PRIVATE_KEY_PASSWORD w environment variables");
  throw new Error("Brak PRIVATE_KEY_PASSWORD");
}

export function getDecryptedKeypair() {
  let obj;

  // Pobieramy JSON z environment (Render)
  if (process.env.ENCRYPTED_KEY_JSON) {
    try {
      obj = JSON.parse(process.env.ENCRYPTED_KEY_JSON);
      console.log("✅ Wczytano ENCRYPTED_KEY_JSON z environment");
    } catch (err) {
      console.error("❌ Błąd parsowania ENCRYPTED_KEY_JSON:", err.message);
      throw new Error("Nieprawidłowy format ENCRYPTED_KEY_JSON");
    }
  } else {
    console.error("❌ Brak ENCRYPTED_KEY_JSON w environment variables");
    throw new Error("Brak ENCRYPTED_KEY_JSON");
  }

  // Sprawdzenie wymaganych pól
  if (!obj.salt || !obj.iv || !obj.tag || !obj.content) {
    console.error("❌ ENCRYPTED_KEY_JSON brakuje wymaganych pól (salt, iv, tag, content)");
    throw new Error("Nieprawidłowa struktura ENCRYPTED_KEY_JSON");
  }

  try {
    const salt = Buffer.from(obj.salt, "hex");
    const iv = Buffer.from(obj.iv, "hex");
    const tag = Buffer.from(obj.tag, "hex");
    const content = Buffer.from(obj.content, "hex");

    console.log("🔑 Generowanie klucza szyfrującego (scrypt N=16384)...");

    // Bezpieczne parametry – działają na Node v21 i Render
    const key = crypto.scryptSync(PASSWORD, salt, 32, { N: 16384, r: 8, p: 1 });

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    const base58Key = decrypted.toString("utf8").trim();

    console.log("🔓 Odszyfrowano, długość base58:", base58Key.length);

    // Sprawdzenie czy to prawidłowy base58 (88 znaków dla pełnego klucza Solana)
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(base58Key)) {
      console.error("❌ Odszyfrowany klucz nie jest prawidłowym base58 (zła długość lub znaki)");
      throw new Error("Nieprawidłowy odszyfrowany klucz – złe hasło lub dane");
    }

    const secretKey = bs58.decode(base58Key);
    const keypair = Keypair.fromSecretKey(secretKey);

    console.log("✅ Klucz prywatny załadowany pomyślnie");
    console.log("📍 Adres portfela (public key):", keypair.publicKey.toBase58());

    return keypair;

  } catch (err) {
    console.error("❌ Błąd podczas odszyfrowywania:", err.message);
    throw new Error("Nie udało się odszyfrować klucza prywatnego");
  }
}
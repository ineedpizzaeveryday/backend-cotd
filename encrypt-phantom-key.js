// encrypt-phantom-key.js – szyfruje klucz z Phantom w Twoim formacie
import crypto from "crypto";

// Twoje hasło z Rendera
const PASSWORD = "SOMETIMESBADBOYSCRIES";

// Pełny private key z Phantom (base58)
const PRIVATE_KEY_BASE58 = "2hr2MgjjjCsTDYC1cJ99kNkH4gCD49JdT1RgVPXptKcxohuwTgcc75tC2JHqff9fU3M3bhJFzbT5pviSGoCe7N7A";

const salt = Buffer.from("579d3d00e008b1164e27559867a89478", "hex"); // możesz użyć starego salt dla kompatybilności
const iv = crypto.randomBytes(12);

// Bezpieczne parametry – działają na Render/Node v21
const key = crypto.scryptSync(PASSWORD, salt, 32, { N: 16384, r: 8, p: 1 });

const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([
  cipher.update(PRIVATE_KEY_BASE58, "utf8"),
  cipher.final()
]);

const tag = cipher.getAuthTag();

const result = {
  salt: salt.toString("hex"),
  iv: iv.toString("hex"),
  tag: tag.toString("hex"),
  content: encrypted.toString("hex")
  // BEZ hmac – jak Twój nowy format
};

console.log("NOWY JSON DO RENDER (z kluczem z Phantom):");
console.log(JSON.stringify(result, null, 2));
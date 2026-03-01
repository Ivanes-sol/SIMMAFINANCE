import fs from "node:fs";
import readline from "node:readline";

// IMPORTANT: use the ESM entrypoints
import { Wallet } from "@ethereumjs/wallet";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

const inPath = process.argv[2] || "/root/deployer.keystore.json";
const outPath = process.argv[3] || "/root/deployer.new.keystore.json";

if (!fs.existsSync(inPath)) {
  console.error(`Input keystore not found: ${inPath}`);
  process.exit(1);
}

const keystoreJson = fs.readFileSync(inPath, "utf8");

const oldPw = await ask(`Enter OLD keystore password for ${inPath}: `);
if (!oldPw) throw new Error("Old password empty");

const wallet = await Wallet.fromV3(keystoreJson, oldPw, true);
const addr = "0x" + wallet.getAddress().toString("hex");
console.error(`Decrypted address: ${addr}`);

const newPw1 = await ask(`Enter NEW password to encrypt ${outPath}: `);
if (!newPw1) throw new Error("New password empty");

const newPw2 = await ask(`Re-enter NEW password: `);
if (newPw1 !== newPw2) throw new Error("New passwords do not match");

// Write a new V3 keystore (scrypt)
const v3 = await wallet.toV3String(newPw1, { kdf: "scrypt" });
fs.writeFileSync(outPath, v3, { mode: 0o600 });

console.error(`Wrote: ${outPath}`);

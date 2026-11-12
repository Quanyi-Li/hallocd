/**
 * 生成本地自签名证书（localhost）—— 供 Neon-HTTP shim 用 HTTPS 监听 443。
 * 输出：server.key（私钥 PEM）/ server.crt（证书 PEM）
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import forge from "node-forge";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date(Date.now() - 60_000);
cert.validity.notAfter = new Date(Date.now() + 3 * 24 * 3600 * 1000);

const attrs = [{ name: "commonName", value: "localhost" }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: "basicConstraints", cA: false },
  { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
  { name: "extKeyUsage", serverAuth: true },
  {
    name: "subjectAltName",
    altNames: [
      { type: 2, value: "localhost" },
      { type: 7, ip: "127.0.0.1" },
    ],
  },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());

writeFileSync(join(HERE, "server.key"), forge.pki.privateKeyToPem(keys.privateKey), "utf8");
writeFileSync(join(HERE, "server.crt"), forge.pki.certificateToPem(cert), "utf8");
console.log("wrote server.key / server.crt");

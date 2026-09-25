import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, constants } from "node:crypto";

export function normalizePem(raw){
  const trimmed=String(raw??"").trim();
  const normalized=trimmed.replace(/\r\n/g,"\n");
  return normalized.includes("\\n") && !normalized.includes("\n") ? normalized.replace(/\\n/g,"\n") : normalized;
}
export function inspectPem(raw){
  const pem=normalizePem(raw);
  const parsed=createPrivateKey(pem);
  return {pem, keyType:parsed.asymmetricKeyType};
}
export function signPss(privatePem,text){
  const {pem,keyType}=inspectPem(privatePem);
  if(keyType!=="rsa" && keyType!=="rsa-pss") throw new Error("RSA_PRIVATE_KEY_REQUIRED");
  const data=Buffer.from(text,"utf8");
  const signature=sign("sha256",data,{key:pem,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32});
  const pub=createPublicKey(createPrivateKey(pem));
  const localVerified=verify("sha256",data,{key:pub,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},signature);
  return {signature:Buffer.from(signature).toString("base64"),keyType,localVerified};
}
export function makeFixture(){
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
  return privateKey;
}

import { createPrivateKey, createPublicKey, sign, verify, constants } from "node:crypto";
import { persistStreamEvidence } from "../ledger/d1.js";

const PROVIDER = "KALSHI";
const CHANNEL = "ticker";
const WS_HTTP_URL = "https://external-api-ws.kalshi.com/trade-api/ws/v2";
const WS_SIGN_PATH = "/trade-api/ws/v2";
const SUBSCRIBE_ID = 1;
const MAX_FAST_RECONNECTS = 6;
const HOLD_MS = 15 * 60 * 1000;
const HEALTH_WAKE_MS = 10 * 60 * 1000;

function iso(){ return new Date().toISOString(); }
function safeJson(text){ try { return JSON.parse(text); } catch { return null; } }
function keyScope(env){ return String(env?.KALSHI_OBSERVER_SCOPES || "").trim(); }
function credentialGate(env){
  const keyIdPresent = Boolean(env?.KALSHI_OBSERVER_KEY_ID);
  const privateKeyPresent = Boolean(env?.KALSHI_OBSERVER_PRIVATE_KEY);
  const scope = keyScope(env);
  const scopeExplicitReadOnly = scope === "read";
  return {
    ready: keyIdPresent && privateKeyPresent && scopeExplicitReadOnly,
    keyIdPresent,
    privateKeyPresent,
    scopeExplicitReadOnly,
    configuredScope: scope || null,
    requiredScope: "read",
    writeScopesAllowed: false
  };
}

function base64(buf){ return Buffer.from(buf).toString("base64"); }

function signKalshi(privateKeyPem, text){
  // Parse only to identify the credential type. Cloudflare's node:crypto sign()
  // accepts the PEM key material directly; passing its PrivateKeyObject through
  // options.key fails in the Workers runtime even though PEM parsing succeeds.
  const parsedKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(parsedKey).export({type:"spki",format:"pem"});
  const data = Buffer.from(text, "utf8");
  if(parsedKey.asymmetricKeyType === "ed25519"){
    const signature = sign(null, data, privateKeyPem);
    const localVerified = verify(null, data, publicKeyPem, signature);
    return {algorithm:"Ed25519", keyType:"ed25519", localVerified, signature:base64(signature)};
  }
  if(parsedKey.asymmetricKeyType === "rsa" || parsedKey.asymmetricKeyType === "rsa-pss"){
    const options = {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    };
    const signature = sign("sha256", data, options);
    const localVerified = verify("sha256", data, {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    }, signature);
    return {algorithm:"RSA-PSS-SHA256", keyType:parsedKey.asymmetricKeyType, localVerified, signature:base64(signature)};
  }
  throw new Error("UNSUPPORTED_KALSHI_KEY_TYPE");
}

function providerTime(msg){
  const m = msg?.msg || {};
  if(typeof m.time === "string" && m.time) return m.time;
  if(Number.isFinite(Number(m.ts_ms))) return new Date(Number(m.ts_ms)).toISOString();
  if(Number.isFinite(Number(m.ts))) return new Date(Number(m.ts) * 1000).toISOString();
  return null;
}

function marketState(msg){
  const m = msg?.msg || {};
  return {
    market_id: m.market_id ?? null,
    market_ticker: m.market_ticker ?? null,
    price_dollars: m.price_dollars ?? null,
    yes_bid_dollars: m.yes_bid_dollars ?? null,
    yes_ask_dollars: m.yes_ask_dollars ?? null,
    volume_fp: m.volume_fp ?? null,
    open_interest_fp: m.open_interest_fp ?? null,
    dollar_volume: m.dollar_volume ?? null,
    dollar_open_interest: m.dollar_open_interest ?? null,
    yes_bid_size_fp: m.yes_bid_size_fp ?? null,
    yes_ask_size_fp: m.yes_ask_size_fp ?? null,
    last_trade_size_fp: m.last_trade_size_fp ?? null,
    ts: m.ts ?? null,
    ts_ms: m.ts_ms ?? null,
    time: m.time ?? null
  };
}

const INITIAL = {
  state:"NO_CREDENTIAL",
  provider:PROVIDER,
  channel:CHANNEL,
  authenticated:false,
  subscriptionAcknowledged:false,
  connectionId:null,
  subscriptionId:null,
  reconnectAttempt:0,
  nextRetryAt:null,
  lastError:null,
  lastConnectedAt:null,
  lastSubscribedAt:null,
  lastMessageAt:null,
  lastMarketTicker:null,
  lastPersistenceStatus:null,
  updatedAt:null,
  evidenceClass:"NONE",
  tradingCapability:false
};

export class KalshiStreamObserver {
  constructor(state, env){
    this.ctx = state;
    this.env = env;
    this.ws = null;
    this.runtimeState = {...INITIAL};
    this.ctx.blockConcurrencyWhile(async()=>{
      const stored = await this.ctx.storage.get("streamState");
      this.runtimeState = {...INITIAL, ...(stored || {}), updatedAt: iso(), tradingCapability:false};
      const gate = credentialGate(this.env);
      if(!gate.ready){
        this.runtimeState = {...this.runtimeState,state:"NO_CREDENTIAL",authenticated:false,subscriptionAcknowledged:false,lastError:gate.scopeExplicitReadOnly?null:"EXPLICIT_READ_SCOPE_REQUIRED",updatedAt:iso()};
      } else if(["LIVE","CONNECTING","AUTHENTICATING","SUBSCRIBING"].includes(this.runtimeState.state)){
        this.runtimeState.state = "RECONNECTING";
        this.runtimeState.authenticated = false;
        this.runtimeState.subscriptionAcknowledged = false;
      }
      await this.save();
    });
  }

  async save(){
    const sanitized = {...this.runtimeState, tradingCapability:false};
    await this.ctx.storage.put("streamState", sanitized);
  }

  async fetch(request){
    const url = new URL(request.url);
    if(url.pathname === "/state") return Response.json(await this.publicState());
    if(url.pathname === "/ensure" && request.method === "POST"){
      await this.ensureConnection();
      return Response.json(await this.publicState());
    }
    if(url.pathname === "/fixture" && request.method === "POST"){
      const body = await request.json().catch(()=>({}));
      return Response.json(await this.runFixture(body));
    }
    return Response.json({ok:false,error:"NOT_FOUND",tradingCapability:false},{status:404});
  }

  async alarm(){
    const gate = credentialGate(this.env);
    if(!gate.ready){
      await this.setState("NO_CREDENTIAL",{authenticated:false,subscriptionAcknowledged:false,nextRetryAt:null,lastError:gate.scopeExplicitReadOnly?null:"EXPLICIT_READ_SCOPE_REQUIRED"});
      return;
    }
    await this.ensureConnection(true);
  }

  async publicState(){
    const gate = credentialGate(this.env);
    return {
      ok:true,
      provider:PROVIDER,
      channel:CHANNEL,
      state:this.runtimeState.state,
      credential:{
        present:gate.keyIdPresent && gate.privateKeyPresent,
        keyIdPresent:gate.keyIdPresent,
        privateKeyPresent:gate.privateKeyPresent,
        explicitReadScopeConfigured:gate.scopeExplicitReadOnly,
        configuredScope:gate.configuredScope,
        writeScopesConfigured:false
      },
      authenticated:Boolean(this.runtimeState.authenticated),
      subscriptionAcknowledged:Boolean(this.runtimeState.subscriptionAcknowledged),
      connectionId:this.runtimeState.connectionId,
      subscriptionId:this.runtimeState.subscriptionId,
      reconnectAttempt:Number(this.runtimeState.reconnectAttempt||0),
      nextRetryAt:this.runtimeState.nextRetryAt,
      lastError:this.runtimeState.lastError,
      lastConnectedAt:this.runtimeState.lastConnectedAt,
      lastSubscribedAt:this.runtimeState.lastSubscribedAt,
      lastMessageAt:this.runtimeState.lastMessageAt,
      lastMarketTicker:this.runtimeState.lastMarketTicker,
      lastPersistenceStatus:this.runtimeState.lastPersistenceStatus,
      evidenceClass:this.runtimeState.evidenceClass || "NONE",
      signingSelfCheck:{algorithm:this.runtimeState.authAlgorithm||null,keyType:this.runtimeState.authKeyType||null,localSignatureVerified:this.runtimeState.localSignatureVerified??null},
      tradingCapability:false,
      orderCapability:false,
      cancellationCapability:false,
      transferCapability:false,
      bankrollCapability:false,
      baselineBindingPresent:false,
      updatedAt:this.runtimeState.updatedAt
    };
  }

  async setState(state, extra={}){
    this.runtimeState = {...this.runtimeState, state, ...extra, updatedAt:iso(), tradingCapability:false};
    await this.save();
  }

  async ensureConnection(fromAlarm=false){
    const gate = credentialGate(this.env);
    if(!gate.ready){
      await this.setState("NO_CREDENTIAL",{
        authenticated:false,
        subscriptionAcknowledged:false,
        nextRetryAt:null,
        lastError:gate.scopeExplicitReadOnly?null:"EXPLICIT_READ_SCOPE_REQUIRED"
      });
      return;
    }
    if(this.ws && this.ws.readyState === WebSocket.OPEN && ["SUBSCRIBING","LIVE"].includes(this.runtimeState.state)){
      await this.ctx.storage.setAlarm(Date.now()+HEALTH_WAKE_MS);
      return;
    }
    if(["CONNECTING","AUTHENTICATING"].includes(this.runtimeState.state) && !fromAlarm) return;
    await this.connect();
  }

  async authHeaders(){
    const gate = credentialGate(this.env);
    if(!gate.ready) throw new Error("CREDENTIAL_GATE_CLOSED");
    const timestamp = Date.now().toString();
    const message = timestamp + "GET" + WS_SIGN_PATH;
    const privateKeyPem = String(this.env.KALSHI_OBSERVER_PRIVATE_KEY).trim();
    const keyId = String(this.env.KALSHI_OBSERVER_KEY_ID).trim();
    const signed = signKalshi(privateKeyPem, message);
    return {
      headers:{
        "KALSHI-ACCESS-KEY": keyId,
        "KALSHI-ACCESS-SIGNATURE": signed.signature,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "Upgrade":"websocket"
      },
      algorithm:signed.algorithm,
      keyType:signed.keyType,
      localSignatureVerified:Boolean(signed.localVerified)
    };
  }

  async connect(){
    const connectionId = crypto.randomUUID();
    await this.setState("CONNECTING",{connectionId,authenticated:false,subscriptionAcknowledged:false,lastError:null,nextRetryAt:null});
    try{
      await this.setState("AUTHENTICATING",{connectionId});
      const auth = await this.authHeaders();
      await this.setState("AUTHENTICATING",{
        connectionId,
        authAlgorithm:auth.algorithm,
        authKeyType:auth.keyType,
        localSignatureVerified:auth.localSignatureVerified
      });
      const response = await fetch(WS_HTTP_URL,{headers:auth.headers});
      if(!response.webSocket){
        const providerBody = await response.text().catch(()=>"");
        const safeBody = String(providerBody||"").replace(/[\r\n]+/g," ").slice(0,180);
        throw new Error("WEBSOCKET_UPGRADE_FAILED_HTTP_"+response.status+(safeBody?"_"+safeBody:""));
      }
      const ws = response.webSocket;
      ws.accept();
      this.ws = ws;
      ws.addEventListener("message", event=>{ this.onMessage(event).catch(error=>this.onSocketFailure(error)); });
      ws.addEventListener("close", event=>{ this.onSocketFailure(new Error("WEBSOCKET_CLOSED_"+event.code)); });
      ws.addEventListener("error", ()=>{ this.onSocketFailure(new Error("WEBSOCKET_ERROR")); });

      await this.setState("SUBSCRIBING",{
        connectionId,
        authenticated:true,
        authAlgorithm:auth.algorithm,
        authKeyType:auth.keyType,
        localSignatureVerified:auth.localSignatureVerified,
        lastConnectedAt:iso(),
        reconnectAttempt:0,
        nextRetryAt:null
      });
      ws.send(JSON.stringify({id:SUBSCRIBE_ID,cmd:"subscribe",params:{channels:[CHANNEL]}}));
      await this.ctx.storage.setAlarm(Date.now()+HEALTH_WAKE_MS);
    }catch(error){
      await this.scheduleReconnect(error);
    }
  }

  async onMessage(event){
    let rawText;
    if(typeof event.data === "string") rawText=event.data;
    else if(event.data instanceof ArrayBuffer) rawText=new TextDecoder().decode(event.data);
    else if(event.data && typeof event.data.text === "function") rawText=await event.data.text();
    else rawText=String(event.data ?? "");
    const data = safeJson(rawText);
    if(!data){
      await this.setState(this.runtimeState.state,{lastError:"MALFORMED_PROVIDER_MESSAGE"});
      return;
    }
    if(data.type === "subscribed"){
      await this.setState("LIVE",{
        authenticated:true,
        subscriptionAcknowledged:true,
        subscriptionId:data.sid ?? data?.msg?.sid ?? null,
        lastSubscribedAt:iso(),
        lastError:null,
        reconnectAttempt:0,
        nextRetryAt:null
      });
      return;
    }
    if(data.type === "error"){
      const code = data?.msg?.code ?? "UNKNOWN";
      const msg = data?.msg?.msg ?? "PROVIDER_ERROR";
      await this.setState("ERROR_HOLD",{lastError:"KALSHI_"+code+"_"+String(msg).slice(0,120)});
      await this.scheduleReconnect(new Error("KALSHI_PROVIDER_ERROR_"+code));
      return;
    }
    if(data.type !== "ticker" || !data?.msg?.market_ticker) return;

    const ingestedAt = iso();
    const evidence = {
      evidenceClass:"REAL_PROVIDER",
      provider:PROVIDER,
      channel:CHANNEL,
      marketTicker:String(data.msg.market_ticker),
      providerSourceTime:providerTime(data),
      ingestedAt,
      messageType:"ticker",
      connectionId:this.runtimeState.connectionId,
      subscriptionId:data.sid ?? this.runtimeState.subscriptionId ?? null,
      marketState:marketState(data),
      rawSource:data
    };
    const persisted = await persistStreamEvidence(this.env.DB,evidence);
    await this.setState("LIVE",{
      authenticated:true,
      subscriptionAcknowledged:true,
      lastMessageAt:ingestedAt,
      lastMarketTicker:evidence.marketTicker,
      lastPersistenceStatus:persisted.status,
      evidenceClass:"REAL_PROVIDER",
      lastError:null
    });
  }

  async onSocketFailure(error){
    this.ws = null;
    await this.scheduleReconnect(error);
  }

  async scheduleReconnect(error){
    const gate = credentialGate(this.env);
    if(!gate.ready){
      await this.setState("NO_CREDENTIAL",{authenticated:false,subscriptionAcknowledged:false,nextRetryAt:null,lastError:"CREDENTIAL_GATE_CLOSED"});
      return;
    }
    const prior = Number(this.runtimeState.reconnectAttempt||0);
    const attempt = prior + 1;
    let delayMs;
    let state;
    if(attempt <= MAX_FAST_RECONNECTS){
      delayMs = Math.min(60000,5000*Math.pow(2,Math.max(0,attempt-1)));
      state = "RECONNECTING";
    }else{
      delayMs = HOLD_MS;
      state = "ERROR_HOLD";
    }
    const nextRetryAt = new Date(Date.now()+delayMs).toISOString();
    await this.setState(state,{
      authenticated:false,
      subscriptionAcknowledged:false,
      reconnectAttempt:attempt,
      nextRetryAt,
      lastError:String(error?.message||error).slice(0,160)
    });
    await this.ctx.storage.setAlarm(Date.now()+delayMs);
  }

  async runFixture(body={}){
    const fixture = body?.fixture === "SIMULATED_TEST_FIXTURE" && body?.message ? body : {
      fixture:"SIMULATED_TEST_FIXTURE",
      message:{
        type:"ticker",
        sid:999,
        msg:{
          market_ticker:"SIMULATED-UMEO-TEST",
          yes_bid_dollars:"0.4500",
          yes_ask_dollars:"0.5500",
          volume_fp:"1.00",
          open_interest_fp:"1.00",
          ts_ms:Date.now(),
          time:iso()
        }
      }
    };
    const data = fixture.message;
    if(data?.type!=="ticker" || !data?.msg?.market_ticker) return {ok:false,test:"SIMULATED_TEST_FIXTURE",error:"INVALID_FIXTURE",realProviderEvidence:false};
    const ingestedAt=iso();
    const evidence={
      evidenceClass:"SIMULATED_TEST_FIXTURE",
      provider:PROVIDER,
      channel:CHANNEL,
      marketTicker:String(data.msg.market_ticker),
      providerSourceTime:providerTime(data),
      ingestedAt,
      messageType:"ticker",
      connectionId:"SIMULATED_TEST_FIXTURE",
      subscriptionId:data.sid ?? null,
      marketState:marketState(data),
      rawSource:{fixture:"SIMULATED_TEST_FIXTURE",message:data}
    };
    const persisted=await persistStreamEvidence(this.env.DB,evidence);
    return {
      ok:persisted.ok,
      test:"SIMULATED_TEST_FIXTURE",
      parser:"PASS",
      persistence:persisted.status,
      marketTicker:evidence.marketTicker,
      providerSourceTime:evidence.providerSourceTime,
      ingestedAt,
      realProviderEvidence:false,
      live:false,
      tradingCapability:false
    };
  }
}

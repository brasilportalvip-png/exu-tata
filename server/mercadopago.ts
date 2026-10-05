import crypto from "node:crypto";

// ======================================================
// PLANOS DE CRÉDITOS — FONTE ÚNICA DE VERDADE NO SERVIDOR
// ======================================================
export interface CreditPlanServer {
  id: string;
  name: string;
  price: number;
  credits: number;
  bonus: number;
  popular?: boolean;
  color: string;
}

export const CREDIT_PLANS: CreditPlanServer[] = [
  {
    id: "iniciacao",
    name: "Iniciação nos Caminhos",
    price: 19.9,
    credits: 10,
    bonus: 2,
    color: "from-zinc-800 to-zinc-900",
  },
  {
    id: "ebó",
    name: "Abertura de Porteira",
    price: 49.9,
    credits: 30,
    bonus: 10,
    popular: true,
    color: "from-red-950/60 to-zinc-900",
  },
  {
    id: "trono",
    name: "Guardião da Encruzilhada",
    price: 99.9,
    credits: 75,
    bonus: 30,
    color: "from-yellow-950/40 to-zinc-900",
  },
];

export function getPlanById(planId: string): CreditPlanServer | undefined {
  return CREDIT_PLANS.find((p) => p.id === planId);
}

// ======================================================
// VALIDAÇÃO OFICIAL DE ASSINATURA WEBHOOK MERCADO PAGO
// ======================================================
export function verifyMercadoPagoSignature(params: {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
  secret?: string;
}): { isValid: boolean; reason?: string } {
  const { xSignature, xRequestId, dataId, secret } = params;

  if (!secret) {
    // Se o segredo não estiver configurado no ambiente, recusa por segurança fail-closed
    return { isValid: false, reason: "MERCADO_PAGO_WEBHOOK_SECRET ausente nas configurações" };
  }

  if (!xSignature || !xRequestId || !dataId) {
    return { isValid: false, reason: "Headers de assinatura x-signature ou x-request-id ou data.id ausentes" };
  }

  // Parse x-signature: "ts=1700000000,v1=abcde..."
  const parts: Record<string, string> = {};
  xSignature.split(",").forEach((part) => {
    const [key, val] = part.split("=");
    if (key && val) parts[key.trim()] = val.trim();
  });

  const ts = parts["ts"];
  const hash = parts["v1"];

  if (!ts || !hash) {
    return { isValid: false, reason: "Formato de x-signature inválido (esperado ts=...,v1=...)" };
  }

  // Tolerância de tempo para replay attack: até 10 minutos
  const parsedTs = parseInt(ts, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(parsedTs) || Math.abs(nowSec - parsedTs) > 600) {
    return { isValid: false, reason: "Timestamp do webhook expirado ou fora da janela de tolerância (replay protection)" };
  }

  // Constrói o template manifest oficial: "id:[data.id];request-id:[x-request-id];ts:[ts];"
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computedHash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const hashBuffer = Buffer.from(hash, "hex");
    const computedBuffer = Buffer.from(computedHash, "hex");

    if (hashBuffer.length !== computedBuffer.length) {
      return { isValid: false, reason: "Tamanho de hash incompatível" };
    }

    const isMatch = crypto.timingSafeEqual(hashBuffer, computedBuffer);
    if (!isMatch) {
      return { isValid: false, reason: "Assinatura criptográfica HMAC não confere" };
    }

    return { isValid: true };
  } catch (err: any) {
    return { isValid: false, reason: `Erro ao comparar assinaturas: ${err.message}` };
  }
}

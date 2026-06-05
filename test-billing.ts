import { SAAS_PLANS } from "./src/lib/abacatepay-saas.functions";

async function test() {
  const token = process.env.ABACATEPAY_API_KEY;
  const ABACATE_API = "https://api.abacatepay.com/v2";

  const qrRes = await fetch(`${ABACATE_API}/pixQrCode/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 1000,
      description: "Teste Inline",
    }),
  });
  const qrResult = await qrRes.json();
  console.log("PIX QR Code result:", qrResult);
}

test();

import { SAAS_PLANS } from "./src/lib/abacatepay-saas.functions";

async function test() {
  const token = process.env.ABACATEPAY_API_KEY;
  const ABACATE_API = "https://api.abacatepay.com/v2";

  // 1. Customer
  const customerRes = await fetch(`${ABACATE_API}/customers/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      name: "Test User",
      taxId: "00000000000",
      cellphone: "11999999999",
      metadata: { test: true },
    }),
  });
  const customerResult = await customerRes.json();
  console.log("Customer:", JSON.stringify(customerResult, null, 2));
  if (!customerResult.data) return;

  const productId = "saas-plan-start-" + Date.now();
  // 2. Product
  const prodRes = await fetch(`${ABACATE_API}/products/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Teste", price: 1000, currency: "BRL", externalId: productId, cycle: "MONTHLY"
    }),
  });
  const prodResult = await prodRes.json();
  console.log("Product:", JSON.stringify(prodResult, null, 2));

  // 3. Subscription
  const subRes = await fetch(`${ABACATE_API}/subscriptions/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Sub", amount: 1000, currency: "BRL", method: "PIX",
      frequency: { cycle: "MONTHLY", dayOfProcessing: new Date().getDate() },
      customerId: customerResult.data.id,
      externalId: "sub-" + Date.now(),
      retryPolicy: { maxRetry: 3, retryEvery: 3 },
      items: [{ id: prodResult.data.id, quantity: 1 }],
    }),
  });
  const subResult = await subRes.json();
  console.log("Subscription:", JSON.stringify(subResult, null, 2));
}

test();

async function testIframe() {
  const url = "https://app.abacatepay.com/pay/bill_4rsFTjDsY32X0GNCkB1XRRh1"; // The URL from previous test
  const res = await fetch(url);
  console.log("X-Frame-Options:", res.headers.get("x-frame-options"));
  console.log("Content-Security-Policy:", res.headers.get("content-security-policy"));
}

testIframe();

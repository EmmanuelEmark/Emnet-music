
const crypto = require("crypto");

const ALLOWED_TYPES = ["birthday", "new_month"];

function getSecret() {
  const secret = process.env.UNSUBSCRIBE_SECRET;

  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET is not configured.");
  }

  return secret;
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
}

function createUnsubscribeToken(userId, type) {
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error("Invalid greeting type.");
  }

  const payload = `${userId}.${type}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

function verifyUnsubscribeToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [userId, type, signature] = parts;

  if (!/^[a-f\d]{24}$/i.test(userId)) {
    return null;
  }

  if (!ALLOWED_TYPES.includes(type)) {
    return null;
  }

  if (!/^[a-f\d]{64}$/i.test(signature)) {
    return null;
  }

  const expected = signPayload(`${userId}.${type}`);

  const suppliedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  return { userId, type };
}

function createUnsubscribeUrl(userId, type) {
  const token = createUnsubscribeToken(userId, type);

  const frontendUrl =
    (process.env.FRONTEND_URL || "http://localhost:3000")
      .replace(/\/+$/, "");

  const url = new URL(`${frontendUrl}/unsubscribe.html`);

  url.searchParams.set("token", token);

  return url.toString();
}

module.exports = {
  createUnsubscribeUrl,
  verifyUnsubscribeToken,
};

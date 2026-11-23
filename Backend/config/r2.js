
const { S3Client } = require("@aws-sdk/client-s3");

let r2Client;

function getR2Config() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
  } = process.env;

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME
  ) {
    throw new Error(
      "Cloudflare R2 environment variables are missing."
    );
  }

  const accountId = R2_ACCOUNT_ID.trim();
  const bucketName = R2_BUCKET_NAME.trim();

  // Cloudflare R2 account IDs are 32 hexadecimal characters.
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error(
      "Invalid R2_ACCOUNT_ID. Use the 32-character " +
      "Cloudflare account ID, not an endpoint URL."
    );
  }

  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME is empty.");
  }

  return {
    accountId,
    accessKeyId: R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: R2_SECRET_ACCESS_KEY.trim(),
    bucketName,
  };
}

function getR2Client() {
  if (!r2Client) {
    const config = getR2Config();

    r2Client = new S3Client({
      region: "auto",

      endpoint:
        `https://${config.accountId}.r2.cloudflarestorage.com`,

      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },

      requestChecksumCalculation: "WHEN_REQUIRED",

      forcePathStyle: true,
    });
  }

  return r2Client;
}

function getR2BucketName() {
  return getR2Config().bucketName;
}

module.exports = {
  getR2Client,
  getR2BucketName,
};

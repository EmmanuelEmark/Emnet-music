
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

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucketName: R2_BUCKET_NAME,
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

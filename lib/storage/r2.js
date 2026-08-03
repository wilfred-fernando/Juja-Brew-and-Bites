import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { normalizePublicHttpUrl } from "@/lib/storage/publicUrl";

let r2Client;

function getR2Config() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = String(process.env.CLOUDFLARE_R2_BUCKET || "juja-assets").trim();
  const endpoint = String(
    process.env.CLOUDFLARE_R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")
  ).trim();
  const publicUrl = normalizePublicHttpUrl(process.env.CLOUDFLARE_R2_PUBLIC_URL);

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint || !publicUrl) {
    throw new Error("Cloudflare R2 upload service is not fully configured.");
  }

  return { accessKeyId, secretAccessKey, bucket, endpoint, publicUrl };
}

function getR2Client(config) {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return r2Client;
}

function publicObjectUrl(baseUrl, key) {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedKey}`;
}

export async function uploadR2Object({ key, body, contentType }) {
  const config = getR2Config();
  await getR2Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return { key, url: publicObjectUrl(config.publicUrl, key) };
}

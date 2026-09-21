import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

/**
 * S3-compatible client configured for Cloudflare R2.
 * R2 requires region: 'auto' and a custom endpoint URL.
 */
let r2ClientInstance: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2ClientInstance;
}

/**
 * Generates a pre-signed PUT URL for direct browser-to-R2 uploads.
 * The URL expires after 5 minutes (300 seconds).
 *
 * @param folder - The storage folder (e.g., 'photos' or 'audio')
 * @param originalFilename - Original filename for extension extraction
 * @param contentType - MIME type of the upload (e.g., 'image/webp')
 * @returns Object with the pre-signed upload URL and the final public URL
 */
export async function generateUploadUrl(
  folder: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  // Generate a unique key to prevent collisions
  const ext = originalFilename.split('.').pop() || 'webp';
  const uniqueId = crypto.randomUUID();
  const timestamp = Date.now();
  const key = `${folder}/${timestamp}-${uniqueId}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 });

  // Construct the public URL from the R2 public domain
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl, key };
}

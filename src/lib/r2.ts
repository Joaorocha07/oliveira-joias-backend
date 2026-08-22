import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { env } from './env'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
})

export async function uploadImagemProduto(
  file: { buffer: Buffer; mimetype: string; originalname: string },
  slug: string,
): Promise<string> {
  const extensao = file.originalname.split('.').pop() ?? 'jpg'
  const chave = `produtos/${slug}/${randomUUID()}.${extensao}`

  await r2.send(
    new PutObjectCommand({
      Bucket: env.r2BucketName,
      Key: chave,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  )

  return `${env.r2PublicUrl}/${chave}`
}

export async function uploadImagemPopup(
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<string> {
  const extensao = file.originalname.split('.').pop() ?? 'jpg'
  const chave = `popups/${randomUUID()}.${extensao}`

  await r2.send(
    new PutObjectCommand({
      Bucket: env.r2BucketName,
      Key: chave,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  )

  return `${env.r2PublicUrl}/${chave}`
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

// SEC-06: Fail hard when ENCRYPTION_KEY is not set — never fall back to a
// hidden dev key. A silent fallback means credentials saved via the UI can't
// be decrypted by the Python worker (they share the same key), and the failure
// manifests far away as "Decryption failed" with no obvious cause.
// Guard deferred to runtime (not module load) so Next.js build succeeds without env vars.
function getSecretKey(): Buffer {
    if (!process.env.ENCRYPTION_KEY) {
        throw new Error(
            'ENCRYPTION_KEY is not set in web/.env. ' +
            'It must match the ENCRYPTION_KEY in your root .env. ' +
            'Generate with: openssl rand -hex 32'
        )
    }
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
}

export function encrypt(text: string): string {
    const SECRET_KEY = getSecretKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag().toString('hex')

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decrypt(text: string): string {
    const SECRET_KEY = getSecretKey()
    const [ivHex, authTagHex, encryptedHex] = text.split(':')

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        SECRET_KEY,
        Buffer.from(ivHex, 'hex')
    )

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

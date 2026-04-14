import { encrypt, decrypt } from "@/lib/encryption"
import assert from "assert"

console.log("🔒 Testing Encryption Logic...")

const ORIGINAL_TEXT = "github_pat_1234567890_very_secret"
console.log(`Original: ${ORIGINAL_TEXT}`)

try {
    const encrypted = encrypt(ORIGINAL_TEXT)
    console.log(`Encrypted: ${encrypted}`)
    assert.notEqual(encrypted, ORIGINAL_TEXT, "Encrypted text should not match original")
    assert.ok(encrypted.includes(":"), "Encrypted text should contain IV:AuthTag:Content format")

    const decrypted = decrypt(encrypted)
    console.log(`Decrypted: ${decrypted}`)
    assert.equal(decrypted, ORIGINAL_TEXT, "Decrypted text MUST match original")

    console.log("✅ Encryption Test Passed!")
} catch (error) {
    console.error("❌ Encryption Test Failed:", error)
    process.exit(1)
}

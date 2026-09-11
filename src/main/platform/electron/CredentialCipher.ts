import { safeStorage } from 'electron'

export interface CredentialCipher {
  encrypt(value: string): string
  decrypt(value: string): string
}

export const credentialCipher: CredentialCipher = {
  encrypt(value) {
    if (!value) return ''
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密尚不可用。')
    return 'desktop-safe-v1:' + safeStorage.encryptString(value).toString('base64')
  },
  decrypt(value) {
    if (!value) return ''
    if (!value.startsWith('desktop-safe-v1:')) throw new Error('凭据不是本机可读取的格式，请重新填写 API Key。')
    return safeStorage.decryptString(Buffer.from(value.slice('desktop-safe-v1:'.length), 'base64'))
  }
}

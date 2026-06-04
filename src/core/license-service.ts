// src/core/license-service.ts
// License 验证服务 — 调用 License Mate API 进行授权验证

export interface LicenseDetails {
  _id: string
  name?: string
  email?: string
  company?: string
  product?: string
  created?: string
  expiry?: string
  machine_node?: string
  machine_sn?: number
  renew_count?: number
}

export interface LicenseValidateResult {
  valid: boolean
  expired: boolean
  details?: LicenseDetails
  error?: string
}

// License Mate API 配置
const LICENSE_API_BASE = 'http://rackdc02.myg2ray.top:5433'
const LICENSE_AUTH_USER = 'admin'
const LICENSE_AUTH_PASS = '1qaz@WSX'

/**
 * 验证 License
 *
 * 调用 License Mate API: GET /api/v1/validate?_id={licenseId}
 *
 * 响应:
 * - 200: License is valid
 * - 202: License is expired
 * - 404: License not found
 */
export async function validateLicense(licenseId: string): Promise<LicenseValidateResult> {
  if (!licenseId || licenseId.trim() === '') {
    return { valid: false, expired: false, error: 'License ID 不能为空' }
  }

  const url = `${LICENSE_API_BASE}/api/v1/validate?_id=${encodeURIComponent(licenseId.trim())}`

  // Basic Auth header
  const auth = Buffer.from(`${LICENSE_AUTH_USER}:${LICENSE_AUTH_PASS}`).toString('base64')

  console.log('[LicenseService] 验证 License:', licenseId)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    })

    console.log('[LicenseService] 响应状态:', response.status)

    if (response.status === 200) {
      // License 有效
      const data = await response.json()
      console.log('[LicenseService] License 有效:', data)

      return {
        valid: true,
        expired: false,
        details: data['license-details'] as LicenseDetails
      }
    }

    if (response.status === 202) {
      // License 已过期
      const data = await response.json()
      console.log('[LicenseService] License 已过期:', data)

      return {
        valid: false,
        expired: true,
        details: data['license-details'] as LicenseDetails,
        error: `License 已过期 (${data['license-details']?.expiry || '未知'})`
      }
    }

    if (response.status === 404) {
      // License 不存在
      console.log('[LicenseService] License 不存在')
      return {
        valid: false,
        expired: false,
        error: 'License 不存在'
      }
    }

    // 其他错误
    const errorText = await response.text()
    console.error('[LicenseService] 未知错误:', response.status, errorText)
    return {
      valid: false,
      expired: false,
      error: `验证失败: ${response.status}`
    }
  } catch (error: any) {
    console.error('[LicenseService] 网络错误:', error?.message || error)
    return {
      valid: false,
      expired: false,
      error: `网络错误: ${error?.message || '无法连接授权服务器'}`
    }
  }
}

/**
 * 检查 License 是否即将过期（提前 7 天警告）
 */
export function isLicenseExpiringSoon(expiryDate: string): boolean {
  if (!expiryDate) return false

  try {
    const expiry = new Date(expiryDate)
    const now = new Date()
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return daysLeft > 0 && daysLeft <= 7
  } catch {
    return false
  }
}
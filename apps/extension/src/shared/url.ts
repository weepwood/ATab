const TRACKING_PARAMETERS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
])

export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input)
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }

    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }
    return url.toString()
  } catch {
    return input.trim()
  }
}

export function getDomain(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '')
  } catch {
    return '未知来源'
  }
}

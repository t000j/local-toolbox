/** Strict wire format for a bounded, native-generated service dependency preview. */
export interface ServicePlanEntry {
  name: string
  displayName: string
  state: 'Running' | 'Stopped'
  nextState: 'Running' | 'Stopped'
  links: string[]
}
export interface ServicePlan {
  plan: true
  name: string
  action: 'start' | 'stop'
  expected: 'Running' | 'Stopped'
  fingerprint: string
  services: ServicePlanEntry[]
}
const validName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\x00-\x1f\x7f]/.test(v)
const keys = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
export function parseServicePlan(output: string, name: string, action: string): ServicePlan | null {
  if (output.length > 64 * 1024) return null
  try {
    const p = JSON.parse(output)
    if (!p || !keys(p, ['plan', 'name', 'action', 'expected', 'fingerprint', 'services']) || p.plan !== true
      || !validName(p.name) || p.name !== name || p.action !== action || !['start', 'stop'].includes(p.action)
      || p.expected !== (p.action === 'start' ? 'Stopped' : 'Running') || typeof p.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(p.fingerprint)
      || !Array.isArray(p.services) || !p.services.length || p.services.length > 32) return null
    const seen = new Map<string, ServicePlanEntry>(), insensitive = new Set<string>()
    const next = p.action === 'start' ? 'Running' : 'Stopped'
    for (const s of p.services) {
      if (!s || !keys(s, ['name', 'displayName', 'state', 'nextState', 'links']) || !validName(s.name)
        || typeof s.displayName !== 'string' || s.displayName.length > 256 || !['Running', 'Stopped'].includes(s.state)
        || s.nextState !== next || !Array.isArray(s.links) || s.links.length > 32 || insensitive.has(s.name.toLowerCase())) return null
      const links = new Set<string>()
      for (const link of s.links) {
        if (!validName(link) || !seen.has(link) || links.has(link)) return null
        links.add(link)
      }
      seen.set(s.name, s); insensitive.add(s.name.toLowerCase())
    }
    const root = p.services.at(-1)
    if (root.name !== name || root.state !== p.expected) return null
    const reachable = new Set<string>()
    function visit(n: string) { if (reachable.has(n)) return; reachable.add(n); seen.get(n)!.links.forEach(visit) }
    visit(name)
    if (reachable.size !== p.services.length) return null
    return p as ServicePlan
  } catch { return null }
}
export function serviceApplyRequest(plan: ServicePlan) {
  return { action: plan.action, name: plan.name, expected: plan.expected, confirmed: true,
    fingerprint: plan.fingerprint, names: plan.services.map(s => s.name) }
}
/** A generic verified:true line is insufficient: require this exact confirmed plan. */
export function serviceOutcome(output: string, plan: ServicePlan) {
  const completed: string[] = [], wanted = plan.services.filter(s => s.state !== s.nextState)
  let verified = false, invalid = output.length > 64 * 1024
  for (const line of output.split(/\r?\n/).filter(l => l.trim())) {
    try {
      const r = JSON.parse(line)
      if (r.progress === true && !verified && keys(r, ['progress', 'name', 'state'])) {
        const entry = wanted[completed.length]
        if (!entry || r.name !== entry.name || r.state !== entry.nextState) invalid = true
        else completed.push(entry.name)
      } else if (r.verified === true && !verified && keys(r, ['verified', 'name', 'action', 'fingerprint'])
        && r.name === plan.name && r.action === plan.action && r.fingerprint === plan.fingerprint
        && completed.length === wanted.length) verified = true
      else invalid = true
    } catch { invalid = true }
  }
  return { completed, verified: verified && !invalid }
}

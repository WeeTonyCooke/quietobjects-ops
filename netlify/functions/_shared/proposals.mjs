import { createHmac, timingSafeEqual } from 'node:crypto'

function secret() {
  const value =
    typeof Netlify !== 'undefined'
      ? Netlify.env.get('PROPOSAL_SIGNING_SECRET')
      : process.env.PROPOSAL_SIGNING_SECRET
  return value || 'dev-only-proposal-secret-change-me'
}

export function signProposal(proposal) {
  const body = canonical(proposal)
  const signature = createHmac('sha256', secret()).update(body).digest('hex')
  return { proposal, signature }
}

export function verifySignedProposal({ proposal, signature }) {
  if (!proposal || !signature) {
    throw Object.assign(new Error('Missing proposal or signature'), {
      status: 400,
    })
  }
  if (proposal.expiresAt && Date.parse(proposal.expiresAt) < Date.now()) {
    throw Object.assign(new Error('Proposal expired — ask again in chat'), {
      status: 400,
    })
  }
  const expected = createHmac('sha256', secret())
    .update(canonical(proposal))
    .digest('hex')
  const a = Buffer.from(String(signature))
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Proposal signature invalid'), { status: 400 })
  }
  return proposal
}

function canonical(proposal) {
  return JSON.stringify(sortKeys(proposal))
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key])
        return acc
      }, {})
  }
  return value
}

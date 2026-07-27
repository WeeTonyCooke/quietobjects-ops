const DEFAULT_ROSATOS_REPO = 'WeeTonyCooke/rosatos'
const DEFAULT_FESTIVAL_REPO = 'WeeTonyCooke/movillefestival'
const DEFAULT_GOLF_REPO = 'WeeTonyCooke/quiet-objects-golf-demo'
const DEFAULT_BRANCH = 'main'

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

export function contentConfig() {
  return {
    token: env('CONTENT_GITHUB_TOKEN') || env('GITHUB_TOKEN'),
    repo: env('CONTENT_REPO', DEFAULT_ROSATOS_REPO),
    branch: env('CONTENT_BRANCH', DEFAULT_BRANCH),
  }
}

export function festivalContentConfig() {
  return {
    token: env('CONTENT_GITHUB_TOKEN') || env('GITHUB_TOKEN'),
    repo: env('FESTIVAL_REPO', DEFAULT_FESTIVAL_REPO),
    branch: env('FESTIVAL_BRANCH', DEFAULT_BRANCH),
  }
}

/**
 * Golf club content config.
 *
 * Phase 1: single GOLF_REPO env var for the pilot club.
 * Multi-club: add per-club env vars — GOLF_REPO_MOSSY_GLEN, GOLF_REPO_GREENCASTLE etc.
 * Pass the slug to pick the right one; falls back to GOLF_REPO.
 */
export function golfContentConfig(slug = null) {
  const envKey = slug
    ? `GOLF_REPO_${slug.toUpperCase().replace(/-/g, '_')}`
    : null
  return {
    token: env('CONTENT_GITHUB_TOKEN') || env('GITHUB_TOKEN'),
    repo: (envKey && env(envKey)) || env('GOLF_REPO', DEFAULT_GOLF_REPO),
    branch: env('GOLF_BRANCH', DEFAULT_BRANCH),
  }
}

/** Return the right config for the given venue slug. */
export function venueContentConfig(venue) {
  if (venue === 'festival') return festivalContentConfig()
  if (venue === 'golf') return golfContentConfig()
  return contentConfig()
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'quietobjects-ops',
  }
}

export async function readJsonFiles(paths, config = null) {
  const { token, repo, branch } = config || contentConfig()
  if (!token) {
    throw Object.assign(new Error('CONTENT_GITHUB_TOKEN is not configured'), {
      status: 500,
    })
  }

  const files = {}
  const meta = {}

  for (const path of paths) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    const res = await fetch(url, { headers: githubHeaders(token) })
    if (!res.ok) {
      throw new Error(
        `GitHub Contents read failed for ${path}: ${res.status} ${await res.text()}`,
      )
    }
    const data = await res.json()
    if (data.encoding !== 'base64' || !data.content) {
      throw new Error(`Unexpected Contents payload for ${path}`)
    }
    files[path] = JSON.parse(
      Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8'),
    )
    meta[path] = { sha: data.sha }
  }

  return { files, meta, repo, branch }
}

export async function putJsonFilesViaContentsApi({
  files,
  message,
  previousMeta = {},
  config = null,
}) {
  const { token, repo, branch } = config || contentConfig()
  if (!token) {
    throw Object.assign(new Error('CONTENT_GITHUB_TOKEN is not configured'), {
      status: 500,
    })
  }

  const headers = githubHeaders(token)
  const results = []
  const paths = Object.keys(files)

  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i]
    const content = `${JSON.stringify(files[path], null, 2)}\n`
    const encoded = Buffer.from(content, 'utf8').toString('base64')

    let sha = previousMeta[path]?.sha
    const headRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers },
    )
    if (headRes.ok) {
      const head = await headRes.json()
      sha = head.sha
    }

    const commitMessage =
      paths.length === 1
        ? message
        : `${message}\n\n[${i + 1}/${paths.length}] ${path}`

    const putRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          content: encoded,
          branch,
          sha,
        }),
      },
    )

    if (!putRes.ok) {
      throw new Error(
        `GitHub Contents publish failed for ${path}: ${putRes.status} ${await putRes.text()}`,
      )
    }

    const body = await putRes.json()
    results.push({
      path,
      sha: body.content?.sha || body.commit?.sha,
      commitSha: body.commit?.sha,
      url: body.commit?.html_url,
    })
  }

  return {
    repo,
    branch,
    paths,
    commits: results,
    sha: results[results.length - 1]?.commitSha,
    url: results[results.length - 1]?.url,
  }
}

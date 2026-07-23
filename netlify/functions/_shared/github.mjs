const DEFAULT_REPO = 'WeeTonyCooke/rosatos'
const DEFAULT_BRANCH = 'main'

function env(name, fallback = '') {
  const value =
    typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
  return value || fallback
}

export function contentConfig() {
  return {
    token: env('CONTENT_GITHUB_TOKEN') || env('GITHUB_TOKEN'),
    repo: env('CONTENT_REPO', DEFAULT_REPO),
    branch: env('CONTENT_BRANCH', DEFAULT_BRANCH),
  }
}

export async function readJsonFiles(paths) {
  const { token, repo, branch } = contentConfig()
  if (!token) {
    throw new Error('CONTENT_GITHUB_TOKEN is not configured')
  }

  const files = {}
  const meta = {}
  for (const path of paths) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    const res = await fetch(url, {
      headers: githubHeaders(token),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GitHub read failed for ${path}: ${res.status} ${text}`)
    }
    const data = await res.json()
    const json = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
    files[path] = json
    meta[path] = { sha: data.sha }
  }
  return { files, meta, repo, branch }
}

/**
 * Commit one or more JSON files in a single commit via the Git Data API.
 */
export async function commitJsonFiles({
  files,
  message,
  previousMeta = {},
}) {
  const { token, repo, branch } = contentConfig()
  if (!token) {
    throw new Error('CONTENT_GITHUB_TOKEN is not configured')
  }

  const headers = githubHeaders(token)

  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${branch}`,
    { headers },
  )
  if (!refRes.ok) {
    throw new Error(`Could not read branch ${branch}: ${await refRes.text()}`)
  }
  const ref = await refRes.json()
  const baseCommitSha = ref.object.sha

  const commitRes = await fetch(
    `https://api.github.com/repos/${repo}/git/commits/${baseCommitSha}`,
    { headers },
  )
  if (!commitRes.ok) {
    throw new Error(`Could not read commit: ${await commitRes.text()}`)
  }
  const baseCommit = await commitRes.json()
  const baseTreeSha = baseCommit.tree.sha

  const treeItems = []
  for (const [path, value] of Object.entries(files)) {
    const content = `${JSON.stringify(value, null, 2)}\n`
    const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    })
    if (!blobRes.ok) {
      throw new Error(`Blob create failed for ${path}: ${await blobRes.text()}`)
    }
    const blob = await blobRes.json()
    treeItems.push({
      path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    })
    // previousMeta kept for callers that want optimistic concurrency later
    void previousMeta
  }

  const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  })
  if (!treeRes.ok) {
    throw new Error(`Tree create failed: ${await treeRes.text()}`)
  }
  const tree = await treeRes.json()

  const newCommitRes = await fetch(
    `https://api.github.com/repos/${repo}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    },
  )
  if (!newCommitRes.ok) {
    throw new Error(`Commit create failed: ${await newCommitRes.text()}`)
  }
  const newCommit = await newCommitRes.json()

  const updateRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommit.sha }),
    },
  )
  if (!updateRes.ok) {
    throw new Error(`Branch update failed: ${await updateRes.text()}`)
  }

  return {
    sha: newCommit.sha,
    url: newCommit.html_url,
    repo,
    branch,
    paths: Object.keys(files),
  }
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

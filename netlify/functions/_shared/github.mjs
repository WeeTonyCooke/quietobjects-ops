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

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'quietobjects-ops',
  }
}

/**
 * Read JSON files via GitHub Contents API.
 */
export async function readJsonFiles(paths) {
  const { token, repo, branch } = contentConfig()
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

/**
 * Publish JSON files via GitHub Contents API (PUT per file).
 * Creates one commit per changed file.
 */
export async function putJsonFilesViaContentsApi({
  files,
  message,
  previousMeta = {},
}) {
  const { token, repo, branch } = contentConfig()
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

    // Re-read SHA immediately before write to reduce conflicts.
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

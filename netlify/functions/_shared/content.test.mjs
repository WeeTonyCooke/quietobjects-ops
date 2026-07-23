import test from 'node:test'
import assert from 'node:assert/strict'
import { filesFromBundle } from './content.mjs'
import { createToolSession, OPS_TOOLS } from './tools.mjs'
import { runDeterministicOpsChat } from './fallback.mjs'
import { signProposal, verifySignedProposal } from './proposals.mjs'

const sampleBundle = {
  programme: {
    tonightOverride: '',
    note: 'Times can shift',
    lineup: [
      {
        day: 6,
        dayLabel: 'Saturday',
        name: 'Seán Óg',
        time: '22:00',
        kind: 'music',
        cue: 'Seán Óg · 22:00',
        detail: 'Seán Óg · Saturdays · 22:00',
      },
    ],
    board: [],
  },
  menu: {
    sections: [
      {
        id: 'mains',
        name: 'Mains',
        items: [
          {
            name: 'Steak Burger',
            description: 'Inishowen beef',
            price: '16.95',
          },
        ],
      },
    ],
  },
}

test('exposes the four ops tools', () => {
  assert.deepEqual(
    OPS_TOOLS.map((tool) => tool.name).sort(),
    [
      'list_programme',
      'set_tonight_override',
      'update_menu_price',
      'update_programme_event',
    ].sort(),
  )
})

test('update_menu_price tool mutates menu and records description', async () => {
  const session = createToolSession(sampleBundle)
  const result = await session.run('update_menu_price', {
    itemName: 'Steak Burger',
    price: '17.50',
  })
  assert.equal(result.ok, true)
  assert.equal(session.state.menu.sections[0].items[0].price, '17.50')
  assert.ok(session.state.changed.has('menu'))
})

test('update_programme_event upserts Saturday and syncs board', async () => {
  const session = createToolSession(sampleBundle)
  const result = await session.run('update_programme_event', {
    dayLabel: 'Saturday',
    name: 'Local Session',
    time: '21:30',
    kind: 'music',
  })
  assert.equal(result.ok, true)
  assert.equal(session.state.programme.lineup[0].name, 'Local Session')
  assert.equal(session.state.programme.board[0].detail.includes('Local Session'), true)
})

test('set_tonight_override clears with empty / clear', async () => {
  const session = createToolSession(sampleBundle)
  await session.run('set_tonight_override', { value: 'Quiz · 22:00' })
  assert.equal(session.state.programme.tonightOverride, 'Quiz · 22:00')
  await session.run('set_tonight_override', { value: 'clear' })
  assert.equal(session.state.programme.tonightOverride, '')
})

test('list_programme returns lineup', async () => {
  const session = createToolSession(sampleBundle)
  const result = await session.run('list_programme', {})
  assert.equal(result.ok, true)
  assert.equal(result.lineup.length, 1)
})

test('deterministic fallback routes phrases through the same tools', async () => {
  const priced = await runDeterministicOpsChat({
    message: 'Steak Burger is 17.50',
    bundle: sampleBundle,
  })
  assert.equal(priced.hasChanges, true)
  assert.equal(priced.toolTrace[0].name, 'update_menu_price')

  const lineup = await runDeterministicOpsChat({
    message: 'Saturday is Seán Furey at 22:00',
    bundle: sampleBundle,
  })
  assert.equal(lineup.toolTrace[0].name, 'update_programme_event')
})

test('signed proposals verify and reject tampering', () => {
  const proposal = {
    venue: 'rosatos',
    summary: 'test',
    files: filesFromBundle(sampleBundle),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const signed = signProposal(proposal)
  assert.equal(verifySignedProposal(signed).summary, 'test')
  assert.throws(() =>
    verifySignedProposal({
      proposal: { ...proposal, summary: 'tampered' },
      signature: signed.signature,
    }),
  )
})

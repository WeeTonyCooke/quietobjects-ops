import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPatches, filesFromBundle } from './content.mjs'
import { proposeDeterministic } from './propose.mjs'
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

test('menu price patch updates item and describes the change', () => {
  const { bundle, descriptions } = applyPatches(sampleBundle, [
    { target: 'menu.price', itemName: 'Steak Burger', price: '17.50' },
  ])
  assert.equal(bundle.menu.sections[0].items[0].price, '17.50')
  assert.match(descriptions[0], /17\.50/)
})

test('programme lineup upsert rewrites Saturday and syncs board', () => {
  const { bundle, descriptions } = applyPatches(sampleBundle, [
    {
      target: 'programme.lineup',
      action: 'upsert',
      entry: {
        dayLabel: 'Saturday',
        name: 'Local Session',
        time: '21:30',
        kind: 'music',
      },
    },
  ])
  assert.equal(bundle.programme.lineup[0].name, 'Local Session')
  assert.equal(bundle.programme.lineup[0].time, '21:30')
  assert.equal(bundle.programme.board[0].detail.includes('Local Session'), true)
  assert.match(descriptions[0], /Saturday/)
})

test('deterministic parser understands common price and lineup phrases', () => {
  const price = proposeDeterministic('Steak Burger is 17.50', sampleBundle)
  assert.equal(price.patches[0].target, 'menu.price')
  assert.equal(price.patches[0].price, '17.50')

  const lineup = proposeDeterministic(
    'Saturday is Seán Furey at 22:00',
    sampleBundle,
  )
  assert.equal(lineup.patches[0].target, 'programme.lineup')
  assert.equal(lineup.patches[0].entry.name, 'Seán Furey')
})

test('signed proposals verify and reject tampering', () => {
  const proposal = {
    venue: 'rosatos',
    summary: 'test',
    files: filesFromBundle(sampleBundle),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const signed = signProposal(proposal)
  const ok = verifySignedProposal(signed)
  assert.equal(ok.summary, 'test')

  assert.throws(() =>
    verifySignedProposal({
      proposal: { ...proposal, summary: 'tampered' },
      signature: signed.signature,
    }),
  )
})

test('filesFromBundle only emits programme and menu paths', () => {
  const files = filesFromBundle(sampleBundle)
  assert.deepEqual(Object.keys(files).sort(), [
    'content/menu.json',
    'content/programme.json',
  ])
})

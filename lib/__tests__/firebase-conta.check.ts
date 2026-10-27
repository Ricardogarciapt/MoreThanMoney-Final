import assert from 'node:assert/strict'
import { lerContaFirebase } from '../firebase-conta'

const json = '{"project_id":"mtm-push-notifications-fdbf1","private_key":"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"}'
assert.equal(lerContaFirebase(json)?.project_id, 'mtm-push-notifications-fdbf1')
assert.equal(lerContaFirebase(json + '\\n')?.project_id, 'mtm-push-notifications-fdbf1', '`\\n` literal no fim (27/10)')
assert.equal(lerContaFirebase(json + '\\n\\n  ')?.project_id, 'mtm-push-notifications-fdbf1')
assert.equal(lerContaFirebase('{"project_id":"x","private_key":"a\nb"}')?.project_id, 'x', 'quebras de linha reais na chave')
assert.equal(lerContaFirebase(''), null)
assert.equal(lerContaFirebase('lixo'), null)
console.log('✓ firebase-conta: lê a chave com e sem o \\n colado')

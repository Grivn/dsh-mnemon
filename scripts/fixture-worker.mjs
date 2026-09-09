#!/usr/bin/env node
// Local synthetic adapter used only by the isolated validation profile.
const prompt = process.argv[2] ?? '', resumed = process.argv[3]
console.log(JSON.stringify({ session_id: resumed || 'fixture-session', resumed: Boolean(resumed) }))
console.log('Fixture prompt: ' + prompt)
if (prompt.includes('[fail]')) { console.error('Requested fixture failure'); process.exitCode = 7 }
else if (prompt.includes('[wait]')) { console.log('Waiting for cancellation'); setInterval(() => {}, 1000) }
else console.log('Fixture task completed. No external service was contacted.')

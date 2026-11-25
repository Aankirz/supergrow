// Runs INSIDE the user's Maritime desktop (node is preinstalled). Talks to Chromium over CDP on :9222.
// Desktop has Node 20: run with `node --experimental-websocket cdp.mjs ...`.
// Usage: node cdp.mjs text            -> {url,title,text} of the active tab
//        node cdp.mjs open <url>      -> navigate the active tab, then text
//        node cdp.mjs click <text>    -> click the element with that text, then text
const [cmd, arg] = process.argv.slice(2)
const MAX_TEXT = 20000

async function activePage() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json()
  const page = tabs.find((t) => t.type === 'page')
  if (!page) throw new Error('no open tab')
  return page
}

function rpc(wsUrl, calls) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const out = []
    let id = 0
    const next = () => {
      if (id === calls.length) { ws.close(); return resolve(out) }
      const [method, params] = calls[id]
      ws.send(JSON.stringify({ id: ++id, method, params }))
    }
    ws.onopen = next
    ws.onerror = () => reject(new Error('cdp socket error'))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id !== id) return
      if (msg.error) { ws.close(); return reject(new Error(msg.error.message)) }
      out.push(msg.result)
      next()
    }
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const READ = ['Runtime.evaluate', {
  expression: 'JSON.stringify({url: location.href, title: document.title, text: document.body ? document.body.innerText : ""})',
  returnByValue: true,
}]

try {
  const page = await activePage()
  if (cmd === 'open') {
    await rpc(page.webSocketDebuggerUrl, [['Page.navigate', { url: arg }]])
    await sleep(4000)
  }
  if (cmd === 'click') {
    // Click the smallest visible element whose text matches. The brain checks the text first.
    const target = JSON.stringify(arg.toLowerCase())
    const [r] = await rpc(page.webSocketDebuggerUrl, [['Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const want = ${target};
      const els = [...document.querySelectorAll('a,button,[role=button],[role=tab],li,span,div')]
        .filter(e => e.offsetParent && (e.innerText || '').trim().toLowerCase().includes(want))
        .sort((a, b) => a.innerText.length - b.innerText.length);
      if (!els.length) return 'not found';
      els[0].click(); return 'clicked';
    })()` }]])
    if (r.result.value !== 'clicked') { console.log(JSON.stringify({ error: `no element with text "${arg}"` })); process.exit(0) }
    await sleep(3000)
  }
  const [res] = await rpc(page.webSocketDebuggerUrl, [READ])
  const data = JSON.parse(res.result.value)
  data.text = data.text.slice(0, MAX_TEXT)
  console.log(JSON.stringify(data))
} catch (err) {
  console.log(JSON.stringify({ error: String(err.message || err) }))
}

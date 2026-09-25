const http = require('http')

const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: 8000,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res, { end: true })
  })

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Backend proxy error', details: err.message }))
  })

  req.pipe(proxyReq, { end: true })
})

server.listen(8080, '127.0.0.1', () => {
  console.log('Bridge proxy listening on http://127.0.0.1:8080 -> forwarding to http://127.0.0.1:8000')
})


const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'UPS_Issue_Collector.html');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const content = fs.readFileSync(filePath, 'utf8');
  res.end(content);
});

server.listen(3000, () => {
  console.log('UPS Collector Server running on http://localhost:3000');
});

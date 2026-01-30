const http = require('http');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = 'C:\\AI\\Trading\\Backtesting-w-Python\\optimization_results';

// Test: can we read the dir?
try {
    const files = fs.readdirSync(RESULTS_DIR);
    console.log('Files found:', files.length);
    const csvs = files.filter(f => f.endsWith('.csv'));
    console.log('CSV files:', csvs.length);
} catch(e) {
    console.error('Read error:', e.message);
}

// Test: can we start a server on 3848?
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('test ok');
});

server.on('error', (err) => {
    console.error('Server error:', err.message);
});

server.listen(3848, '0.0.0.0', () => {
    console.log('Server listening on 3848');
});

// Keep alive
setInterval(() => {
    console.log('still alive', new Date().toISOString());
}, 5000);

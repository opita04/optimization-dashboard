var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 3848;
var RESULTS_DIR = 'C:\\AI\\Trading\\Backtesting-w-Python\\optimization_results';
var ARCHIVE_DIR = path.join(RESULTS_DIR, 'archived');
var STATIC_DIR = __dirname;

// Ensure archive dir exists
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR);

var MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.csv': 'text/csv'
};

function parseCSV(text) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',');
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
        var values = [];
        var current = '';
        var inQuotes = false;
        for (var j = 0; j < lines[i].length; j++) {
            var ch = lines[i][j];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
            current += ch;
        }
        values.push(current);
        var row = {};
        headers.forEach(function(h, idx) {
            var v = (values[idx] || '').trim();
            if (v !== '' && !isNaN(v) && h !== 'best_params') row[h] = parseFloat(v);
            else if (v === 'True') row[h] = true;
            else if (v === 'False') row[h] = false;
            else row[h] = v;
        });
        rows.push(row);
    }
    return rows;
}

function getCSVFiles(dir) {
    return fs.readdirSync(dir)
        .filter(function(f) { return f.endsWith('.csv') && (f.startsWith('parallel_results_') || f.startsWith('renko_results_')); })
        .sort();
}

function loadResultsFromDir(dir, isArchived) {
    var files = getCSVFiles(dir);
    var allRows = [];
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var text = fs.readFileSync(path.join(dir, file), 'utf8');
        var rows = parseCSV(text);
        var isRenko = file.startsWith('renko_');
        var timestamp = file.replace(/^(parallel|renko)_results_/, '').replace('.csv', '');
        rows.forEach(function(r) {
            r.source_file = file;
            r.run_timestamp = timestamp;
            r.type = isRenko ? 'Renko' : 'Parallel';
            r.archived = !!isArchived;
            if (isRenko && !r.timeframe) r.timeframe = 'Renko_' + r.brick_size;
        });
        allRows.push.apply(allRows, rows);
    }
    return allRows;
}

function readBody(req, cb) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() { cb(body); });
}

function handleRequest(req, res) {
    try {
        var urlObj = new URL(req.url, 'http://localhost:' + PORT);
    } catch(e) {
        res.writeHead(400); res.end('Bad URL'); return;
    }
    var pathname = urlObj.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204); res.end(); return;
    }

    // Active results
    if (pathname === '/api/results') {
        try {
            var data = loadResultsFromDir(RESULTS_DIR, false);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Archived results
    if (pathname === '/api/archived') {
        try {
            var data = loadResultsFromDir(ARCHIVE_DIR, true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // List active run files
    if (pathname === '/api/runs') {
        try {
            var active = getCSVFiles(RESULTS_DIR).map(function(f) {
                var stat = fs.statSync(path.join(RESULTS_DIR, f));
                var rows = parseCSV(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
                return { file: f, size: stat.size, modified: stat.mtime, results: rows.length };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(active));
        } catch(e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // List archived run files
    if (pathname === '/api/runs/archived') {
        try {
            var archived = getCSVFiles(ARCHIVE_DIR).map(function(f) {
                var stat = fs.statSync(path.join(ARCHIVE_DIR, f));
                var rows = parseCSV(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8'));
                return { file: f, size: stat.size, modified: stat.mtime, results: rows.length };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(archived));
        } catch(e) {
            res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Archive run files (move to archived/)
    if (pathname === '/api/archive-runs' && req.method === 'POST') {
        readBody(req, function(body) {
            try {
                var files = JSON.parse(body); // array of filenames
                var moved = [];
                files.forEach(function(f) {
                    var src = path.join(RESULTS_DIR, f);
                    var dst = path.join(ARCHIVE_DIR, f);
                    if (fs.existsSync(src)) {
                        fs.renameSync(src, dst);
                        moved.push(f);
                        // Also move the matching top_10 JSON if it exists
                        var jsonFile = f.replace('_results_', '_top_10_').replace('.csv', '.json');
                        var jsonSrc = path.join(RESULTS_DIR, jsonFile);
                        if (fs.existsSync(jsonSrc)) {
                            fs.renameSync(jsonSrc, path.join(ARCHIVE_DIR, jsonFile));
                        }
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ moved: moved }));
            } catch(e) {
                res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Restore run files (move back from archived/)
    if (pathname === '/api/restore-runs' && req.method === 'POST') {
        readBody(req, function(body) {
            try {
                var files = JSON.parse(body);
                var restored = [];
                files.forEach(function(f) {
                    var src = path.join(ARCHIVE_DIR, f);
                    var dst = path.join(RESULTS_DIR, f);
                    if (fs.existsSync(src)) {
                        fs.renameSync(src, dst);
                        restored.push(f);
                        var jsonFile = f.replace('_results_', '_top_10_').replace('.csv', '.json');
                        var jsonSrc = path.join(ARCHIVE_DIR, jsonFile);
                        if (fs.existsSync(jsonSrc)) {
                            fs.renameSync(jsonSrc, path.join(RESULTS_DIR, jsonFile));
                        }
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ restored: restored }));
            } catch(e) {
                res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Static files
    var filepath = pathname === '/' ? '/index.html' : pathname;
    filepath = path.join(STATIC_DIR, filepath);
    if (!filepath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    var ext = path.extname(filepath);
    var contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
        var fileData = fs.readFileSync(filepath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileData);
    } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
}

var server = http.createServer(handleRequest);

server.on('error', function(err) { console.error('Server error:', err); });
process.on('uncaughtException', function(err) { console.error('Uncaught:', err); });

server.listen(PORT, '0.0.0.0', function() {
    console.log('Dashboard running at http://localhost:' + PORT);
    console.log('Results dir: ' + RESULTS_DIR);
    console.log('Archive dir: ' + ARCHIVE_DIR);
});

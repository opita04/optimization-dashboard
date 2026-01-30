let allData = [];
let filteredData = [];
let charts = {};
let sortDirection = {};
let filters = { type: 'all', symbol: 'all', strategy: 'all' };

async function loadData() {
    try {
        document.getElementById('reloadBtn').textContent = '⏳ Loading...';
        const response = await fetch('/api/results');
        allData = await response.json();
        filteredData = [...allData];
        
        buildFilters();
        updateSummaryCards();
        updateCharts();
        updateTable();
        
        document.getElementById('lastUpdate').textContent = 
            `Last updated: ${new Date().toLocaleString()} | ${allData.length} total results loaded`;
        document.getElementById('reloadBtn').textContent = '🔄 Reload Data';
    } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('reloadBtn').textContent = '❌ Error - Retry';
    }
}

function buildFilters() {
    const filterBar = document.getElementById('filterBar');
    if (!filterBar) return;
    
    const types = [...new Set(allData.map(d => d.type))].sort();
    const symbols = [...new Set(allData.map(d => d.symbol))].sort();
    const strategies = [...new Set(allData.map(d => d.strategy))].sort();
    
    filterBar.innerHTML = `
        <label>Type: <select id="filterType" onchange="applyFilters()">
            <option value="all">All (${allData.length})</option>
            ${types.map(t => `<option value="${t}">${t} (${allData.filter(d=>d.type===t).length})</option>`).join('')}
        </select></label>
        <label>Symbol: <select id="filterSymbol" onchange="applyFilters()">
            <option value="all">All</option>
            ${symbols.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select></label>
        <label>Strategy: <select id="filterStrategy" onchange="applyFilters()">
            <option value="all">All</option>
            ${strategies.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select></label>
        <label>Prop Firm: <select id="filterProp" onchange="applyFilters()">
            <option value="all">All</option>
            <option value="passed">Passed Only</option>
            <option value="failed">Failed Only</option>
        </select></label>
    `;
}

function applyFilters() {
    const type = document.getElementById('filterType')?.value || 'all';
    const symbol = document.getElementById('filterSymbol')?.value || 'all';
    const strategy = document.getElementById('filterStrategy')?.value || 'all';
    const prop = document.getElementById('filterProp')?.value || 'all';
    
    filteredData = allData.filter(d => {
        if (type !== 'all' && d.type !== type) return false;
        if (symbol !== 'all' && d.symbol !== symbol) return false;
        if (strategy !== 'all' && d.strategy !== strategy) return false;
        if (prop === 'passed' && !d.prop_firm_passed) return false;
        if (prop === 'failed' && d.prop_firm_passed) return false;
        return true;
    });
    
    updateSummaryCards();
    updateCharts();
    updateTable();
}

function updateSummaryCards() {
    const data = filteredData;
    const total = data.length;
    if (total === 0) {
        document.getElementById('totalConfigs').textContent = '0';
        document.getElementById('bestProfit').textContent = '$0';
        document.getElementById('avgWinRate').textContent = '0%';
        document.getElementById('propFirmRate').textContent = '0%';
        document.getElementById('avgSharpe').textContent = '0';
        return;
    }
    const bestProfit = Math.max(...data.map(d => d.net_profit || 0));
    const avgWinRate = data.reduce((a, b) => a + (b.win_rate || 0), 0) / total;
    const propPassed = data.filter(d => d.prop_firm_passed).length;
    const avgSharpe = data.reduce((a, b) => a + (b.sharpe_ratio || 0), 0) / total;
    
    document.getElementById('totalConfigs').textContent = total;
    document.getElementById('bestProfit').textContent = `$${bestProfit.toFixed(2)}`;
    document.getElementById('avgWinRate').textContent = `${avgWinRate.toFixed(1)}%`;
    document.getElementById('propFirmRate').textContent = `${((propPassed / total) * 100).toFixed(1)}%`;
    document.getElementById('avgSharpe').textContent = avgSharpe.toFixed(2);
}

function updateCharts() {
    const data = filteredData;
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
    
    // Profit by Symbol
    const symbolData = {};
    data.forEach(d => {
        if (!symbolData[d.symbol]) symbolData[d.symbol] = 0;
        symbolData[d.symbol] += d.net_profit || 0;
    });
    
    charts.symbolChart = new Chart(document.getElementById('profitBySymbol'), {
        type: 'bar',
        data: {
            labels: Object.keys(symbolData),
            datasets: [{
                label: 'Total Profit',
                data: Object.values(symbolData),
                backgroundColor: Object.values(symbolData).map(v => v >= 0 ? '#3fb950' : '#f85149'),
                borderRadius: 4
            }]
        },
        options: getChartOptions('Profit ($)')
    });
    
    // Profit by Timeframe
    const tfData = {};
    data.forEach(d => {
        if (!tfData[d.timeframe]) tfData[d.timeframe] = 0;
        tfData[d.timeframe] += d.net_profit || 0;
    });
    
    charts.tfChart = new Chart(document.getElementById('profitByTimeframe'), {
        type: 'bar',
        data: {
            labels: Object.keys(tfData),
            datasets: [{
                label: 'Total Profit',
                data: Object.values(tfData),
                backgroundColor: Object.values(tfData).map(v => v >= 0 ? '#58a6ff' : '#f85149'),
                borderRadius: 4
            }]
        },
        options: getChartOptions('Profit ($)')
    });
    
    // Prop Firm Pass/Fail Pie
    const passed = data.filter(d => d.prop_firm_passed).length;
    const failed = data.length - passed;
    
    charts.propChart = new Chart(document.getElementById('propFirmChart'), {
        type: 'doughnut',
        data: {
            labels: ['Passed', 'Failed'],
            datasets: [{
                data: [passed, failed],
                backgroundColor: ['#3fb950', '#f85149']
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#c9d1d9' }
                }
            }
        }
    });
    
    // Trade Count Distribution
    const tradeBuckets = {'0-5': 0, '6-10': 0, '11-20': 0, '21-50': 0, '50+': 0};
    data.forEach(d => {
        const t = d.total_trades || 0;
        if (t <= 5) tradeBuckets['0-5']++;
        else if (t <= 10) tradeBuckets['6-10']++;
        else if (t <= 20) tradeBuckets['11-20']++;
        else if (t <= 50) tradeBuckets['21-50']++;
        else tradeBuckets['50+']++;
    });
    
    charts.tradeChart = new Chart(document.getElementById('tradeCountChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(tradeBuckets),
            datasets: [{
                label: 'Configs',
                data: Object.values(tradeBuckets),
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: getChartOptions('Number of Configs')
    });
    
    // Parameter Scatter - SL ATR Mult vs Profit
    const scatterData = data.map(d => {
        const params = d.best_params || {};
        return {
            x: params.sl_atr_mult || 0,
            y: d.net_profit || 0
        };
    }).filter(d => d.x > 0);
    
    charts.paramChart = new Chart(document.getElementById('paramChart'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'SL ATR Mult vs Profit',
                data: scatterData,
                backgroundColor: scatterData.map(d => d.y >= 0 ? '#3fb950' : '#f85149'),
                pointRadius: 8
            }]
        },
        options: {
            scales: {
                x: {
                    title: { display: true, text: 'SL ATR Multiplier', color: '#8b949e' },
                    ticks: { color: '#8b949e' },
                    grid: { color: '#30363d' }
                },
                y: {
                    title: { display: true, text: 'Net Profit ($)', color: '#8b949e' },
                    ticks: { color: '#8b949e' },
                    grid: { color: '#30363d' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function getChartOptions(yLabel) {
    return {
        responsive: true,
        scales: {
            x: {
                ticks: { color: '#8b949e' },
                grid: { color: '#30363d' }
            },
            y: {
                title: { display: true, text: yLabel, color: '#8b949e' },
                ticks: { color: '#8b949e' },
                grid: { color: '#30363d' }
            }
        },
        plugins: {
            legend: { display: false }
        }
    };
}

function updateTable() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    filteredData.forEach(d => {
        const row = document.createElement('tr');
        const profit = d.net_profit || 0;
        const profitClass = profit >= 0 ? 'positive' : 'negative';
        const propClass = d.prop_firm_passed ? 'passed' : 'failed';
        const typeClass = d.type === 'Renko' ? 'type-renko' : 'type-parallel';
        
        row.innerHTML = `
            <td><span class="${typeClass}">${d.type || '-'}</span></td>
            <td>${d.strategy || '-'}</td>
            <td>${d.symbol || '-'}</td>
            <td>${d.timeframe || '-'}</td>
            <td class="${profitClass}">$${profit.toFixed(2)}</td>
            <td>${(d.max_drawdown || 0).toFixed(2)}%</td>
            <td>${(d.win_rate || 0).toFixed(1)}%</td>
            <td>${d.total_trades || 0}</td>
            <td>${(d.sharpe_ratio || 0).toFixed(2)}</td>
            <td>${(d.profit_factor || 0).toFixed(2)}</td>
            <td class="${propClass}" title="${d.prop_firm_violation || ''}">${d.prop_firm_passed ? '✅ PASS' : '❌ FAIL'}</td>
            <td class="run-ts">${d.run_timestamp || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

function sortTable(colIndex) {
    const dir = sortDirection[colIndex] === 'asc' ? 'desc' : 'asc';
    sortDirection[colIndex] = dir;
    
    const keys = ['type', 'strategy', 'symbol', 'timeframe', 'net_profit', 'max_drawdown', 
                  'win_rate', 'total_trades', 'sharpe_ratio', 'profit_factor', 'prop_firm_passed', 'run_timestamp'];
    const key = keys[colIndex];
    
    filteredData.sort((a, b) => {
        let va = a[key] ?? 0;
        let vb = b[key] ?? 0;
        if (typeof va === 'string') {
            return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return dir === 'asc' ? va - vb : vb - va;
    });
    
    updateTable();
}

document.addEventListener('DOMContentLoaded', loadData);

#!/usr/bin/env python3
"""
MT5 Optimization Results Dashboard Server
Run with: python server.py
Then open http://localhost:8080
"""

import http.server
import json
import os
import csv
import ast
from pathlib import Path
from urllib.parse import urlparse

# Configuration
PORT = 8080
RESULTS_DIR = r"C:\AI\Trading\Backtesting-w-Python\optimization_results"
DASHBOARD_DIR = Path(__file__).parent


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/api/results':
            self.send_results()
        else:
            super().do_GET()

    def send_results(self):
        """Read all optimization results and return as JSON"""
        results = []
        results_path = Path(RESULTS_DIR)
        
        if not results_path.exists():
            self.send_json({'error': f'Results directory not found: {RESULTS_DIR}'}, 404)
            return

        # Read CSV files
        for csv_file in results_path.glob('*.csv'):
            try:
                with open(csv_file, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        result = self.parse_row(row)
                        results.append(result)
            except Exception as e:
                print(f"Error reading {csv_file}: {e}")

        # Read JSON files (top results)
        for json_file in results_path.glob('*top*.json'):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            # Check if not already in results (avoid duplicates)
                            key = (item.get('symbol'), item.get('timeframe'), item.get('strategy'))
                            existing = any(
                                (r.get('symbol'), r.get('timeframe'), r.get('strategy')) == key
                                for r in results
                            )
                            if not existing:
                                results.append(item)
            except Exception as e:
                print(f"Error reading {json_file}: {e}")

        # Sort by net_profit descending
        results.sort(key=lambda x: x.get('net_profit', 0), reverse=True)
        
        self.send_json(results)

    def parse_row(self, row):
        """Parse a CSV row into a clean dict"""
        result = {}
        
        # String fields
        for key in ['strategy', 'symbol', 'timeframe', 'prop_firm_violation']:
            result[key] = row.get(key, '')
        
        # Numeric fields
        for key in ['net_profit', 'max_drawdown', 'win_rate', 'total_trades', 
                    'sharpe_ratio', 'profit_factor', 'trials_completed', 'optimization_time']:
            try:
                result[key] = float(row.get(key, 0))
            except (ValueError, TypeError):
                result[key] = 0
        
        # Boolean fields
        result['prop_firm_passed'] = row.get('prop_firm_passed', '').lower() == 'true'
        
        # Parse best_params (stored as string dict)
        try:
            params_str = row.get('best_params', '{}')
            result['best_params'] = ast.literal_eval(params_str)
        except:
            result['best_params'] = {}
        
        return result

    def send_json(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))


def main():
    os.chdir(DASHBOARD_DIR)
    
    print(f"""
=============================================================
       MT5 Optimization Results Dashboard                     
=============================================================
  Server running at: http://localhost:{PORT}
  Results from: {RESULTS_DIR}
  Press Ctrl+C to stop                                        
=============================================================
""")
    
    with http.server.HTTPServer(('', PORT), DashboardHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == '__main__':
    main()

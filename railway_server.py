"""
Railway server for DayFlow scheduler.
Provides HTTP API to trigger scheduler runs.
"""
import os
import sys
from flask import Flask, jsonify, request
from pathlib import Path

# Add dayflow module to path
sys.path.insert(0, str(Path(__file__).parent))

from dayflow.scheduler_main import main as scheduler_main

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'dayflow-scheduler'})

@app.route('/run-scheduler', methods=['POST'])
def run_scheduler():
    """
    Run the scheduler for a specific date and user.
    Expects JSON: { "date": "YYYY-MM-DD", "user_id": "uuid" }
    """
    try:
        data = request.get_json()
        run_date = data.get('date')
        user_id = data.get('user_id')
        
        if not run_date or not user_id:
            return jsonify({
                'ok': False,
                'error': 'Missing required fields: date, user_id'
            }), 400
        
        # Verify Supabase credentials are available
        if not os.environ.get('SUPABASE_URL') or not os.environ.get('SUPABASE_SERVICE_KEY'):
            return jsonify({
                'ok': False,
                'error': 'Missing Supabase credentials in environment'
            }), 500
        
        # Build args for scheduler_main
        args = ['--date', run_date, '--user', user_id, '--force']
        
        # Run scheduler
        print(f"Running scheduler for user {user_id} on {run_date}")
        
        # Set timezone for the scheduler
        os.environ['TZ'] = 'Europe/London'
        os.environ['TEST_USER_ID'] = user_id
        
        # Mock sys.argv for scheduler_main
        old_argv = sys.argv
        sys.argv = ['scheduler_main.py'] + args
        
        try:
            scheduler_main()
            return jsonify({
                'ok': True,
                'message': f'Scheduler completed for {run_date}'
            })
        finally:
            sys.argv = old_argv
            
    except Exception as e:
        print(f"Error running scheduler: {e}")
        return jsonify({
            'ok': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port)

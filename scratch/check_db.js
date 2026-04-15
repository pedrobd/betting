import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zqrdahblpcppazxoidow.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcmRhaGJscGNwcGF6eG9pZG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODgzNjEsImV4cCI6MjA5MTc2NDM2MX0.QGGs7fGVm_JpPMA9j93_isrH_nKzB5gSNdTrOZtQc4o';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCount() {
    const { data, count, error } = await supabase
        .from('betting_predictions')
        .select('*', { count: 'exact' });
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Total records in betting_predictions:', count);
        console.log('Sample data:', data.slice(0, 1));
    }
}

checkCount();

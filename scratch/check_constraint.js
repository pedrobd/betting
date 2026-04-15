import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zqrdahblpcppazxoidow.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcmRhaGJscGNwcGF6eG9pZG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODgzNjEsImV4cCI6MjA5MTc2NDM2MX0.QGGs7fGVm_JpPMA9j93_isrH_nKzB5gSNdTrOZtQc4o';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data: cols, error: err1 } = await supabase.rpc('get_table_info', { tname: 'betting_predictions' });
    // Since get_table_info might not exist, let's try a direct query if possible or just try to insert one and see.
    // Actually, I'll try to insert a duplicate and see if it fails due to a constraint.
    
    console.log("Trying to insert a test record...");
    const testRecord = {
        team_home: 'Test Home',
        team_away: 'Test Away',
        time: '12:00',
        odd: 1.5,
        confidence: 80,
        reasoning: 'Test',
        session_id: 'test'
    };
    
    const { error: err2 } = await supabase.from('betting_predictions').insert(testRecord);
    if (err2) {
        console.log("Insert 1 error:", err2.message);
    } else {
        console.log("Insert 1 success.");
    }
    
    // Try to insert the SAME record again
    const { error: err3 } = await supabase.from('betting_predictions').insert(testRecord);
    if (err3) {
        console.log("Insert 2 error (expected if unique constraint exists):", err3.message);
    } else {
        console.log("Insert 2 success. OH NO, unique constraint is MISSING!");
    }
    
    // Cleanup
    await supabase.from('betting_predictions').delete().eq('session_id', 'test');
}

checkSchema();

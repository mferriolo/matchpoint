import { createClient } from '@supabase/supabase-js';


// Initialize Supabase client
// Using direct values from project configuration
const supabaseUrl = 'https://nrnmzvenwjqsnegxyaxz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybm16dmVud2pxc25lZ3h5YXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzE4NDQsImV4cCI6MjA2OTUwNzg0NH0.1xtsiMitJmIX7F2GBJ0OsCh-6ErPAigryQoiSHUPp2I';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };
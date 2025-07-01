/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req: Request) => {
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log('=== EMAIL FUNCTION DEBUG ===');
    
    // Check environment variables
    const envStatus = {
      SMTP_HOST: Deno.env.get('SMTP_HOST') || 'NOT SET',
      SMTP_PORT: Deno.env.get('SMTP_PORT') || 'NOT SET',
      SMTP_USERNAME: Deno.env.get('SMTP_USERNAME') || 'NOT SET',
      SMTP_PASSWORD: Deno.env.get('SMTP_PASSWORD') || 'NOT SET',
      FROM_EMAIL: Deno.env.get('FROM_EMAIL') || 'NOT SET',
      FROM_NAME: Deno.env.get('FROM_NAME') || 'NOT SET'
    };
    
    console.log('Environment Status:', envStatus);
    
    // Count missing variables
    const missingCount = Object.values(envStatus).filter(value => value === 'NOT SET').length;
    
    if (missingCount > 0) {
      const response = {
        success: false,
        error: `${missingCount} environment variables are missing`,
        environmentStatus: envStatus,
        instructions: [
          "1. Go to https://supabase.com/dashboard/project/uqaixxobcopzpcmaaunz/settings/edge-functions",
          "2. Click 'Add variable' for each missing variable",
          "3. Use these values:",
          "   SMTP_HOST = smtp.gmail.com",
          "   SMTP_PORT = 465", 
          "   SMTP_USERNAME = official.jhapartment@gmail.com",
          "   SMTP_PASSWORD = tnwq ksil xkap rpoo",
          "   FROM_EMAIL = official.jhapartment@gmail.com",
          "   FROM_NAME = J&H Management System"
        ]
      };
      
      console.log('Response:', JSON.stringify(response, null, 2));
      
      return new Response(
        JSON.stringify(response),
        { headers: corsHeaders, status: 500 }
      );
    }
    
    // If all variables are set, return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'All environment variables are configured!',
        environmentStatus: envStatus
      }),
      { headers: corsHeaders, status: 200 }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Function error: ' + error.message
      }),
      { headers: corsHeaders, status: 500 }
    );
  }
}); 
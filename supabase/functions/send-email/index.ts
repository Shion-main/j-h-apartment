/// <reference lib="deno.ns" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

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
    
    // Parse request body
    const requestBody = await req.json();
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    
    // Extract email parameters from request
    const { emailType, recipientData, templateData } = requestBody;
    
    if (!emailType || !recipientData || !templateData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: emailType, recipientData, or templateData'
        }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    // Get recipient emails
    let recipients = [];
    
    if (recipientData.email) {
      recipients.push(recipientData.email);
    } else if (recipientData.emails && Array.isArray(recipientData.emails)) {
      recipients = recipientData.emails;
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing recipient email(s)'
        }),
        { headers: corsHeaders, status: 400 }
      );
    }
    
    // Configure mail transporter
    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port: parseInt(Deno.env.get('SMTP_PORT') || '465'),
      secure: true, // true for 465, false for other ports
      auth: {
        user: Deno.env.get('SMTP_USERNAME'),
        pass: Deno.env.get('SMTP_PASSWORD')
      }
    });
    
    console.log('Mail transporter created');
    
    // Send email(s)
    const emailResults = [];
    
    for (const recipient of recipients) {
      try {
        console.log(`Sending email to ${recipient}...`);
        
        const emailContent = {
          from: `"${Deno.env.get('FROM_NAME')}" <${Deno.env.get('FROM_EMAIL')}>`,
          to: recipient,
          subject: templateData.subject || `J&H Management - ${emailType}`,
          html: templateData.html
        };
        
        // Add attachments if present
        if (templateData.attachments && Array.isArray(templateData.attachments)) {
          emailContent.attachments = templateData.attachments;
        }
        
        const info = await transporter.sendMail(emailContent);
        
        console.log(`Email sent to ${recipient}: ${info.messageId}`);
        emailResults.push({
          recipient,
          success: true,
          messageId: info.messageId
        });
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        emailResults.push({
          recipient,
          success: false,
          error: error.message
        });
      }
    }
    
    // Check if all emails were sent successfully
    const allSuccessful = emailResults.every(result => result.success);
    
    return new Response(
      JSON.stringify({
        success: allSuccessful,
        emailResults,
        emailsSent: emailResults.filter(r => r.success).length,
        emailsFailed: emailResults.filter(r => !r.success).length
      }),
      { headers: corsHeaders, status: allSuccessful ? 200 : 207 }
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
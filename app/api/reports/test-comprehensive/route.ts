import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || '3';
  const year = searchParams.get('year') || '2025';

  try {
    // Test the comprehensive report API endpoint
    const baseUrl = request.url.split('/api/reports/test-comprehensive')[0];
    
    // Test 1: Fetch comprehensive report data
    console.log(`Testing comprehensive report for ${month}/${year}`);
    const reportResponse = await fetch(`${baseUrl}/api/reports/detailed?month=${month}&year=${year}`);
    
    if (!reportResponse.ok) {
      throw new Error(`Report API failed: ${reportResponse.status}`);
    }
    
    const reportData = await reportResponse.json();
    
    // Test 2: Fetch CSV download
    const csvResponse = await fetch(`${baseUrl}/api/reports/detailed?month=${month}&year=${year}&download=true`);
    
    if (!csvResponse.ok) {
      throw new Error(`CSV API failed: ${csvResponse.status}`);
    }
    
    const csvContent = await csvResponse.text();
    
    // Return test results
    return NextResponse.json({
      success: true,
      testResults: {
        reportDataAvailable: !!reportData.data,
        csvGenerated: csvContent.length > 0,
        csvSections: {
          hasSection1: csvContent.includes('SECTION 1: OVERALL MONTHLY SNAPSHOT'),
          hasSection2: csvContent.includes('SECTION 2: TENANT & ROOM STATUS OVERVIEW'),
          hasSection3: csvContent.includes('SECTION 3: DETAILED BILLING & PAYMENT BREAKDOWN'),
          hasSection4: csvContent.includes('SECTION 4: DETAILED COMPANY EXPENSES BREAKDOWN'),
          hasSection5: csvContent.includes('SECTION 5: TENANT MOVEMENT BREAKDOWN'),
        },
        reportData: reportData.data,
        csvPreview: csvContent.substring(0, 500) + '...',
        csvLength: csvContent.length
      }
    });

  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      testResults: null
    }, { status: 500 });
  }
} 
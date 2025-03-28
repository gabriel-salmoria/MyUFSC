import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route to fetch MatrUFSC data for a specific campus
 * This loads directly from the campus-specific JSON file
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters (default to FLO campus and latest semester)
    const { searchParams } = new URL(request.url);
    const campus = searchParams.get('campus') || 'FLO';
    const semester = searchParams.get('semester') || '20251';
    
    try {
      // Load the campus-specific file directly
      // Files are now stored as {semester}-{campus}.json in the data/classes directory
      const { default: campusData } = await import(`@/data/classes/${semester}-${campus}.json`);
      
      if (!campusData) {
        return NextResponse.json({ error: `Campus '${campus}' data for semester ${semester} not found` }, { status: 404 });
      }
      
      console.log(`${campus} campus data for semester ${semester} loaded successfully`);
      
      // Return the campus data
      return NextResponse.json(campusData);
    } catch (error) {
      console.error(`Error loading MatrUFSC data for campus ${campus} (${semester}):`, error);
      return NextResponse.json({ 
        error: `Failed to load data for campus ${campus} (${semester})` 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in MatrUFSC API route:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 